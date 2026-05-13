# GPU 관련 문서

GPU 클러스터, CUDA 아키텍처, 고성능 인터커넥트 등 GPU 관련 기술 문서 모음입니다.

## 문서 목록

### [GPU 클러스터 & 분산 AI 용어 사전](gpu-cluster-glossary.md)
RDMA, InfiniBand, NCCL, vLLM/SGLang 등 GPU 클러스터 및 분산 AI 추론/학습 관련 핵심 용어 정리

**주요 내용**:
- RDMA & InfiniBand 네트워킹 (RDMA, RoCE, QP, GID, HCA, Fabric)
- GPU 하드웨어 비교 (NVIDIA vs AMD 세대별)
- CUDA vs ROCm 비교
- NCCL & GPU 통신 라이브러리
- 분산 AI 추론 엔진 (vLLM, SGLang, Mooncake)

### [NVIDIA CUDA 아키텍처](nvidia-cuda-architecture.md)
NVIDIA CUDA 컴파일 과정 및 GPU 아키텍처 심화 분석

**주요 내용**:
- CUDA 컴파일 파이프라인 (nvcc, PTX, SASS)
- GPU 메모리 계층 구조
- Warp, Thread Block, Grid
- Streaming Multiprocessor (SM) 아키텍처

### [InfiniBand & GPU 인터커넥트](infiniband-nvlink-nvswitch.md)
InfiniBand, NVLink, NVSwitch 등 GPU 인터커넥트 기술 정리

**주요 내용**:
- GPU 클러스터의 3가지 통신 유형
- NVLink & NVSwitch (서버 내 GPU-GPU)
- InfiniBand & RDMA (서버 간 GPU-GPU)
- GPUDirect RDMA
- 네트워크 토폴로지 (Fat-Tree, Rail-Optimized)

---

**최종 업데이트**: 2026-05-14
