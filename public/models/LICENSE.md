# Model Licenses — models bundled under public/models/

## opencv-zoo (proctoring identity engine)

| File | Source | License | Version |
| ---- | ------ | ------- | ------- |
| face_detection_yunet_2023mar.onnx | github.com/opencv/opencv_zoo (models/face_detection_yunet) | Apache-2.0 (see opencv_zoo LICENSE; model may also carry its own — verified Apache-2.0) | 2023mar |
| face_recognition_sface_2021dec.onnx | github.com/opencv/opencv_zoo (models/face_recognition_sface) | Apache-2.0 | 2021dec |

Runtime: onnxruntime-web 1.20.1 (MIT).

Commercial use: Apache-2.0 permits commercial use with attribution/NOTICE.
No paid API or hosted service is involved ($0 cost ceiling preserved).

## mediapipe (facial landmark temporal analysis)

| File | Source | License | Version |
| ---- | ------ | ------- | ------- |
| face_landmarker/face_landmarker.task | storage.googleapis.com/mediapipe-models (official MediaPipe model CDN) | Apache-2.0 (MediaPipe runtime and face_landmarker model are Apache-2.0) | float16/latest (downloaded 2026-09-21) |

Runtime: @mediapipe/tasks-vision ^0.10.35 (Apache-2.0). WASM assets are
resolved from the jsdelivr CDN mirror of the npm package at runtime.

Purpose: OBSERVATION-ONLY temporal facial signals (head pose, eye blink,
mouth state, blendshape movement) feeding probabilistic proctoring events.
Landmarks are NEVER used as identity embeddings (Session 6 rule: keypoint-
derived vectors must not back an identity decision — that authority stays
with SFace + server RPCs).

No paid API or hosted service is involved ($0 cost ceiling preserved).
