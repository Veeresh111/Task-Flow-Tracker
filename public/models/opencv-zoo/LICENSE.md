# Model Licenses — opencv-zoo models bundled in public/models/opencv-zoo

| File | Source | License | Version |
| ---- | ------ | ------- | ------- |
| face_detection_yunet_2023mar.onnx | github.com/opencv/opencv_zoo (models/face_detection_yunet) | Apache-2.0 (see opencv_zoo LICENSE; model may also carry its own — verified Apache-2.0) | 2023mar |
| face_recognition_sface_2021dec.onnx | github.com/opencv/opencv_zoo (models/face_recognition_sface) | Apache-2.0 | 2021dec |

Runtime: onnxruntime-web 1.20.1 (MIT). MediaPipe tasks-vision (Apache-2.0)
remains a dependency of other UI features but is NO LONGER used for
proctoring identity (pseudo-descriptors removed in Session 6).

UPDATE (Session 6 final): MediaPipe Face Landmarker is now used for
OBSERVATION-ONLY temporal signals (blink, head pose, mouth state) — see
../LICENSE.md and src/lib/proctoring/landmark-engine.ts. It still never
produces identity embeddings.

Commercial use: Apache-2.0 permits commercial use with attribution/NOTICE.
No paid API or hosted service is involved ($0 cost ceiling preserved).
