"""Extract inner-canthus-stabilized 60 fps nystagmus metrics and loopable MLN waveform."""

import argparse
import json
import math
import urllib.request
from pathlib import Path

import cv2
import mediapipe as mp
import numpy as np
from scipy import ndimage, signal

FACE_LANDMARKER_URL = (
    "https://storage.googleapis.com/mediapipe-models/face_landmarker/"
    "face_landmarker/float16/1/face_landmarker.task"
)
EYE_RADIUS_MM = 12.0
MEAN_IRIS_DIAMETER_MM = 11.7

# Standard 478-point MediaPipe FaceMesh / FaceLandmarker indices
EYE_SPECS = {
    "OD": {"outer": 33, "inner": 133, "upper": 159, "lower": 145, "iris": 468, "ring": (469, 470, 471, 472)},
    "OS": {"outer": 263, "inner": 362, "upper": 386, "lower": 374, "iris": 473, "ring": (474, 475, 476, 477)},
}


def ensure_landmarker_model(cache_dir: Path) -> Path:
    cache_dir.mkdir(parents=True, exist_ok=True)
    model_path = cache_dir / "face_landmarker.task"
    if not model_path.exists():
        urllib.request.urlretrieve(FACE_LANDMARKER_URL, model_path)
    return model_path


def extract_eye_frame(lm, rgb: np.ndarray, spec: dict) -> tuple:
    h, w = rgb.shape[:2]
    ox, oy = lm[spec["outer"]].x * w, lm[spec["outer"]].y * h
    ix, iy = lm[spec["inner"]].x * w, lm[spec["inner"]].y * h
    ux, uy = lm[spec["upper"]].x * w, lm[spec["upper"]].y * h
    lx, ly = lm[spec["lower"]].x * w, lm[spec["lower"]].y * h
    cx, cy = lm[spec["iris"]].x * w, lm[spec["iris"]].y * h

    ew = math.hypot(ox - ix, oy - iy)
    eh = math.hypot(ux - lx, uy - ly)
    if ew < 4.0:
        return (np.nan,) * 7

    axis_x, axis_y = (ox - ix) / ew, (oy - iy) / ew
    dx_px = (cx - ix) * axis_x + (cy - iy) * axis_y
    dy_px = -(cx - ix) * axis_y + (cy - iy) * axis_x

    ring_pts = np.array([[lm[idx].x * w, lm[idx].y * h] for idx in spec["ring"]])
    d1 = np.hypot(*(ring_pts[0] - ring_pts[2]))
    d2 = np.hypot(*(ring_pts[1] - ring_pts[3]))
    iris_diam = 0.5 * (d1 + d2)

    x0, x1 = max(0, int(cx - ew * 0.35)), min(w, int(cx + ew * 0.35))
    y0, y1 = max(0, int(cy - ew * 0.25)), min(h, int(cy + ew * 0.25))
    if x1 <= x0 + 2 or y1 <= y0 + 2:
        return (np.nan,) * 7

    patch = cv2.cvtColor(rgb[y0:y1, x0:x1], cv2.COLOR_RGB2GRAY)
    patch_std = float(np.std(patch))
    patch_p5 = float(np.percentile(patch, 5))
    ear = eh / ew
    return dx_px, dy_px, ew, iris_diam, patch_std, patch_p5, ear


def extract_video_tracks(video_path: Path, cache_dir: Path) -> tuple[float, dict]:
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise RuntimeError(f"Failed to open video: {video_path}")

    fps = float(cap.get(cv2.CAP_PROP_FPS) or 60.0)
    use_solutions = hasattr(mp, "solutions") and hasattr(mp.solutions, "face_mesh")

    if use_solutions:
        detector = mp.solutions.face_mesh.FaceMesh(
            static_image_mode=False,
            max_num_faces=1,
            refine_landmarks=True,
            min_detection_confidence=0.3,
            min_tracking_confidence=0.3,
        )
    else:
        from mediapipe.tasks.python import BaseOptions, vision

        model_path = ensure_landmarker_model(cache_dir)
        options = vision.FaceLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=str(model_path)),
            running_mode=vision.RunningMode.VIDEO,
            num_faces=1,
            min_face_detection_confidence=0.25,
            min_face_presence_confidence=0.25,
            min_tracking_confidence=0.25,
        )
        detector = vision.FaceLandmarker.create_from_options(options)

    records = {eye: [] for eye in EYE_SPECS}
    frame_idx = 0
    try:
        while True:
            ok, bgr = cap.read()
            if not ok:
                break
            rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
            landmarks = None
            if use_solutions:
                res = detector.process(rgb)
                if res.multi_face_landmarks:
                    landmarks = res.multi_face_landmarks[0].landmark
            else:
                mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
                ts_ms = int(round(frame_idx * 1000.0 / fps))
                res = detector.detect_for_video(mp_img, ts_ms)
                if res.face_landmarks:
                    landmarks = res.face_landmarks[0]

            for eye, spec in EYE_SPECS.items():
                if landmarks is None:
                    records[eye].append((np.nan,) * 7)
                else:
                    records[eye].append(extract_eye_frame(landmarks, rgb, spec))
            frame_idx += 1
    finally:
        cap.release()
        detector.close()

    cols = ("dx_px", "dy_px", "ew", "diam", "std", "p5", "ear")
    tracks = {
        eye: {name: np.array([r[i] for r in records[eye]], dtype=np.float64) for i, name in enumerate(cols)}
        for eye in EYE_SPECS
    }
    tracks["frame_count"] = frame_idx
    return fps, tracks


def longest_true_runs(mask: np.ndarray, min_len: int = 60) -> list[tuple[int, int]]:
    runs = []
    start = None
    for idx, val in enumerate(mask):
        if val and start is None:
            start = idx
        elif not val and start is not None:
            if idx - start >= min_len:
                runs.append((start, idx))
            start = None
    if start is not None and len(mask) - start >= min_len:
        runs.append((start, len(mask)))
    return runs


def interp_nan(arr: np.ndarray) -> np.ndarray:
    valid = np.isfinite(arr)
    if not np.any(valid):
        return np.zeros_like(arr)
    idx = np.arange(len(arr))
    return np.interp(idx, idx[valid], arr[valid])


def bandpass_deg(series: np.ndarray, fps: float, low_hz: float = 0.45, high_hz: float = 12.0) -> np.ndarray:
    detrended = signal.detrend(series)
    nyq = 0.5 * fps
    hi = min(high_hz, nyq * 0.85)
    sos = signal.butter(3, [low_hz, hi], btype="bandpass", fs=fps, output="sos")
    return signal.sosfiltfilt(sos, detrended)


def compute_phase_metrics(x_deg: np.ndarray, fps: float) -> dict:
    bp = bandpass_deg(x_deg, fps)
    freqs = np.fft.rfftfreq(len(bp), d=1.0 / fps)
    mag = np.abs(np.fft.rfft(bp * np.hanning(len(bp))))
    band = (freqs >= 0.5) & (freqs <= 10.0)
    dom_freq = float(freqs[band][np.argmax(mag[band])]) if np.any(band) else 1.5
    p2p = float(np.percentile(bp, 97.5) - np.percentile(bp, 2.5))
    vel = np.diff(bp) * fps
    slow_thresh = np.percentile(np.abs(vel), 75) if len(vel) else 0.0
    slow_samples = np.abs(vel[np.abs(vel) <= slow_thresh])
    spv = float(np.median(slow_samples)) if len(slow_samples) else 0.0
    return {
        "dominant_freq_hz": round(dom_freq, 3),
        "peak_to_peak_deg": round(p2p, 3),
        "slow_phase_velocity_deg_s": round(spv, 2),
        "filtered": bp,
    }


def extract_loopable_waveform(x_bp: np.ndarray, y_bp: np.ndarray, fps: float, dom_freq: float) -> dict:
    # shortcut: selects best 2-3.5s seam-matched window from primary MLN run, upgrade to multi-beat phase averaging
    n = len(x_bp)
    min_len = min(n, max(120, int(round(2.0 * fps))))
    max_len = min(n, max(min_len, int(round(3.8 * fps))))
    approx_period = max(20, int(round(fps / max(dom_freq, 0.8))))

    best_score = float("inf")
    best_slice = (0, min_len)
    vel_x = np.gradient(x_bp)

    for length in range(min_len, max_len + 1, max(1, approx_period // 6)):
        for start in range(0, n - length + 1, 4):
            end = start + length
            seg_x = x_bp[start:end]
            rms = float(np.sqrt(np.mean(seg_x ** 2)))
            if rms < 0.25:
                continue
            seam_err = abs(seg_x[0] - seg_x[-1]) + 0.35 * abs(vel_x[start] - vel_x[end - 1])
            score = seam_err / (rms + 1e-6)
            if score < best_score:
                best_score = score
                best_slice = (start, end)

    s0, s1 = best_slice
    wx = signal.detrend(x_bp[s0:s1]).copy()
    wy = signal.detrend(y_bp[s0:s1]).copy()

    # Smooth 6-sample circular seam blend so loop wrap (i0 -> (i0+1)%n) is C0/C1 continuous
    blend_k = min(6, len(wx) // 8)
    if blend_k >= 2:
        mid_x = 0.5 * (wx[0] + wx[-1])
        mid_y = 0.5 * (wy[0] + wy[-1])
        for k in range(blend_k):
            alpha = 0.5 * (1.0 - math.cos(math.pi * (k + 1) / (blend_k + 1)))
            wx[k] = mid_x + alpha * (wx[k] - mid_x)
            wx[-1 - k] = mid_x + alpha * (wx[-1 - k] - mid_x)
            wy[k] = mid_y + alpha * (wy[k] - mid_y)
            wy[-1 - k] = mid_y + alpha * (wy[-1 - k] - mid_y)

    wx -= float(np.mean(wx))
    wy -= float(np.mean(wy))

    freqs = np.fft.rfftfreq(len(wx), d=1.0 / fps)
    mag = np.abs(np.fft.rfft(wx * np.hanning(len(wx))))
    band = (freqs >= 0.5) & (freqs <= 10.0)
    wf_freq = float(freqs[band][np.argmax(mag[band])]) if np.any(band) else dom_freq
    amp_deg = float(np.max(wx) - np.min(wx))

    return {
        "sample_rate_hz": round(fps, 3),
        "cycle_freq_hz": round(wf_freq, 3),
        "amplitude_deg": round(amp_deg, 3),
        "samples_x_deg": [round(float(v), 4) for v in wx],
        "samples_y_deg": [round(float(v), 4) for v in wy],
    }


def analyze_video(video_path: Path) -> dict:
    cache_dir = Path(__file__).resolve().parent / ".cache"
    fps, tracks = extract_video_tracks(video_path, cache_dir)
    n_frames = tracks["frame_count"]
    duration_s = n_frames / fps

    open_masks = {}
    deg_series = {}
    ratios = {}
    for eye in ("OD", "OS"):
        t = tracks[eye]
        raw_open = (
            np.isfinite(t["std"])
            & (t["std"] > 24.0)
            & (t["p5"] < 100.0)
            & (t["ear"] > 0.16)
        )
        open_masks[eye] = ndimage.median_filter(raw_open.astype(np.uint8), size=15).astype(bool)

        vis_ew = t["ew"][open_masks[eye]]
        vis_diam = t["diam"][open_masks[eye]]
        med_ew = float(np.nanmedian(vis_ew)) if len(vis_ew) else float(np.nanmedian(t["ew"]))
        med_diam = float(np.nanmedian(vis_diam)) if len(vis_diam) else float(np.nanmedian(t["diam"]))
        deg_per_px = (MEAN_IRIS_DIAMETER_MM / med_diam) / EYE_RADIUS_MM * (180.0 / math.pi)

        dx_norm = interp_nan(t["dx_px"] / np.maximum(t["ew"], 1e-6)) * med_ew * deg_per_px
        dy_norm = interp_nan(t["dy_px"] / np.maximum(t["ew"], 1e-6)) * med_ew * deg_per_px
        deg_series[eye] = (dx_norm, dy_norm, deg_per_px, med_ew)
        ratios[eye] = interp_nan(t["dx_px"] / np.maximum(t["ew"], 1e-6))

    bino_mask = open_masks["OD"] & open_masks["OS"]
    od_occ_mask = (~open_masks["OD"]) & open_masks["OS"]
    os_occ_mask = open_masks["OD"] & (~open_masks["OS"])

    # Isolate steady forward-fixation binocular frames (exclude lateral gaze sweeps)
    od_dx = deg_series["OD"][0]
    med_bino = float(np.median(od_dx[bino_mask])) if np.any(bino_mask) else 0.0
    smooth_od = ndimage.median_filter(od_dx, size=max(15, int(round(0.75 * fps))))
    steady_bino = bino_mask & (np.abs(smooth_od - med_bino) < 4.5)
    bino_runs = longest_true_runs(steady_bino, min_len=max(90, int(1.5 * fps)))
    if not bino_runs:
        bino_runs = longest_true_runs(bino_mask, min_len=60)
    best_bino = max(bino_runs, key=lambda r: r[1] - r[0]) if bino_runs else (0, min(n_frames, 180))
    bino_metrics = compute_phase_metrics(od_dx[best_bino[0] : best_bino[1]], fps)

    # Evaluate contiguous occluded MLN runs (track the UNOCCLUDED eye)
    candidates = []
    for occ_eye, track_eye, mask in (("OD", "OS", od_occ_mask), ("OS", "OD", os_occ_mask)):
        for s0, s1 in longest_true_runs(mask, min_len=max(120, int(2.0 * fps))):
            x_seg = deg_series[track_eye][0][s0:s1]
            y_seg = deg_series[track_eye][1][s0:s1]
            m = compute_phase_metrics(x_seg, fps)
            candidates.append((s1 - s0, occ_eye, track_eye, s0, s1, m, y_seg))

    if not candidates:
        raise RuntimeError("No monocular occlusion phase >= 2.0s detected in video.")

    # Prefer the longest clean MLN run (or highest oscillatory power if comparable length)
    candidates.sort(key=lambda c: c[0] * min(c[5]["peak_to_peak_deg"], 10.0), reverse=True)
    _, occ_eye, track_eye, m0, m1, mln_metrics, y_seg = candidates[0]
    y_bp = bandpass_deg(y_seg, fps)
    waveform = extract_loopable_waveform(mln_metrics["filtered"], y_bp, fps, mln_metrics["dominant_freq_hz"])

    # Exotropia estimate: binocular outward eye asymmetry + cover-test adducting shift of OS when OD covered
    if np.any(steady_bino) and np.any(od_occ_mask):
        bino_os_rat = float(np.median(ratios["OS"][steady_bino]))
        bino_od_rat = float(np.median(ratios["OD"][steady_bino]))
        cov_os_rat = float(np.median(ratios["OS"][od_occ_mask]))
        _, _, os_deg_px, os_med_ew = deg_series["OS"]
        cover_shift_deg = (bino_os_rat - cov_os_rat) * os_med_ew * os_deg_px
        asym_deg = (bino_os_rat - bino_od_rat) * os_med_ew * os_deg_px
        exotropia_deg = max(0.5, 0.5 * (abs(cover_shift_deg) + max(0.0, asym_deg)))
    else:
        exotropia_deg = 4.0

    return {
        "source_fps": round(fps, 3),
        "duration_s": round(duration_s, 3),
        "calibration": {
            "method": "inner_canthus_normalized",
            "eye_radius_mm": EYE_RADIUS_MM,
        },
        "phases": {
            "binocular": {
                "frame_count": int(np.sum(steady_bino)),
                "dominant_freq_hz": bino_metrics["dominant_freq_hz"],
                "peak_to_peak_deg": bino_metrics["peak_to_peak_deg"],
                "slow_phase_velocity_deg_s": bino_metrics["slow_phase_velocity_deg_s"],
            },
            "mln_occluded": {
                "frame_count": int(m1 - m0),
                "dominant_freq_hz": mln_metrics["dominant_freq_hz"],
                "peak_to_peak_deg": mln_metrics["peak_to_peak_deg"],
                "slow_phase_velocity_deg_s": mln_metrics["slow_phase_velocity_deg_s"],
                "occluded_eye": occ_eye,
            },
        },
        "exotropia_estimate_deg": round(float(exotropia_deg), 2),
        "waveform": waveform,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Analyze 60 fps ocular nystagmus video into Vuarbit JSON.")
    parser.add_argument("--video", required=True, help="Path to input 60 fps ocular video")
    parser.add_argument("--out", default="public/data/nystagmus_waveform.json", help="Output JSON path")
    args = parser.parse_args()

    result = analyze_video(Path(args.video))
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8") as fh:
        json.dump(result, fh, indent=2)

    print(
        f"Wrote {out_path} | fps={result['source_fps']} dur={result['duration_s']}s "
        f"| bino={result['phases']['binocular']} "
        f"| mln={result['phases']['mln_occluded']} "
        f"| exotropia={result['exotropia_estimate_deg']}deg "
        f"| waveform_samples={len(result['waveform']['samples_x_deg'])}"
    )


if __name__ == "__main__":
    main()
