---
tags:
  - GPU
  - CUDA
---

# GPU 클러스터 용어 사전

> GPU 클러스터 네트워킹(RDMA, InfiniBand), GPU 하드웨어(NVIDIA vs AMD), 분산 AI 추론(vLLM, SGLang) 등 핵심 용어를 정리한다.

## 1. RDMA & InfiniBand 네트워킹

### RDMA (Remote Direct Memory Access)

- **정의**: CPU를 거치지 않고 네트워크 카드(NIC)가 원격 서버의 메모리에 직접 접근하는 기술
- **핵심 특징**: Zero-copy, Kernel bypass, CPU offload
- **레이턴시**: ~1μs (TCP/IP는 ~100μs)
- **사용 사례**: GPU AllReduce, 분산 스토리지, HPC

**RDMA 프로토콜 종류**:

| 프로토콜 | 네트워크 | 성능 | 특징 |
|---------|---------|------|------|
| **InfiniBand (IB)** | 전용 IB | 최고 (NDR 400Gbps) | 전용 하드웨어, 최저 지연시간 |
| **RoCE v2** | 이더넷 | 높음 | IP 라우팅 가능, 기존 인프라 활용 |
| **RoCE v1** | 이더넷 | 높음 | Layer 2 전용 (VLAN 내부만) |
| **iWARP** | 이더넷 | 중간 | TCP/IP 기반, 라우팅 가능 |

### RoCE (RDMA over Converged Ethernet)

- **정의**: 이더넷 네트워크에서 RDMA를 구현하는 프로토콜
- **v1 vs v2**: v1은 Layer 2 전용 (VLAN 내부), v2는 Layer 3 지원 (IP 라우팅, UDP 캡슐화)
- **장점**: 기존 이더넷 인프라 재사용, InfiniBand 대비 저렴
- **단점**: PFC(Priority Flow Control), ECN(Explicit Congestion Notification) 등 네트워크 튜닝 필수
- **주요 사용처**: 클라우드 GPU 클러스터 (AWS EFA, Azure InfiniBand)

### RoCEv2 (RDMA over Converged Ethernet v2)

- **정의**: RoCE의 개선 버전, IP/UDP 위에서 동작
- **프로토콜 스택**: `RDMA → IB Transport → UDP → IP → Ethernet`
- **UDP 포트**: 4791 (기본값)
- **핵심 개선**: IP 라우팅 지원 → 서브넷 간 통신 가능<br/>ECMP(Equal-Cost Multi-Path) 로드밸런싱 활용<br/>VLAN, ACL 등 이더넷 기능 사용 가능
- **요구사항**: DCB(Data Center Bridging), PFC, ECN

### QP (Queue Pair)

- **정의**: RDMA 통신의 기본 단위. 송신 큐(Send Queue)와 수신 큐(Receive Queue)로 구성
- **역할**: 각 통신 세션마다 하나의 QP 생성 (TCP 소켓과 유사)

**Transport 타입 비교**:

| 타입 | 비유 | 신뢰성 | 연결성 | RDMA Read/Atomic | 용도 |
|------|------|--------|--------|------------------|------|
| **RC** | TCP | O 보장 | 1:1 연결 | O 가능 | **대부분 사용** (NCCL, MPI, UCX) |
| **UC** | - | X 재전송 없음 | 1:1 연결 | X 불가능 | 스트리밍 (패킷 손실 허용) |
| **UD** | UDP | X 보장 없음 | 1:N | X 불가능 | 멀티캐스트, 서비스 발견 |
| **DC** | - | O 보장 | 동적 연결 | O 가능 | 대규모 클러스터 (QP 수 절약) |

**RC가 기본인 이유**:
- RDMA Read와 Atomic 연산이 **RC에서만 동작**
- NCCL, UCX, MPI 등 모든 주요 라이브러리가 RC 사용
- GPU 간 AllReduce는 RDMA Write + Read 조합 필요 → RC 필수

**DC (Dynamically Connected)**:
- 수천 개 노드 환경에서 QP 수를 줄이기 위해 사용
- 예: 1,000 노드 × RC → 100만 개 QP vs DC → 1,000개 QP
- Mellanox ConnectX-4 이상에서 지원

**상태 머신**: RESET → INIT → RTR(Ready To Receive) → RTS(Ready To Send) → SQD → ERROR

**예시**: NCCL AllReduce 시 각 GPU 쌍마다 RC QP 생성 (RDMA Write + Read 사용)

### GID (Global Identifier)

- **정의**: InfiniBand/RoCE에서 각 포트를 식별하는 128비트 주소
- **형식**: IPv6 주소와 유사 (예: `fe80::7a2b:cbff:fe9e:3d4f`)
- **타입**: **GID 0 (Link-Local)**: `fe80::/64`, Layer 2 전용, 라우팅 불가<br/>**GID 1+ (Routable)**: IP 기반 GID, Layer 3 라우팅 가능
- **확인 방법**: `ibv_devinfo -v \
- **용도**: QP 생성 시 로컬/원격 GID 지정, RoCEv2 통신 엔드포인트

### HCA (Host Channel Adapter)

- **정의**: InfiniBand 네트워크 인터페이스 카드 (NIC의 InfiniBand 버전)
- **역할**: RDMA 오프로드 (CPU 대신 DMA 수행)<br/>QP, CQ(Completion Queue), Memory Registration 관리<br/>Verbs API 제공 (ibv_post_send, ibv_post_recv 등)
- **주요 제조사**: NVIDIA/Mellanox (ConnectX 시리즈), Intel
- **모델 예시**: ConnectX-7: NDR InfiniBand 400Gbps<br/>ConnectX-6 Dx: HDR InfiniBand 200Gbps, RoCEv2 지원
- **GPU와 연결**: PCIe 또는 NVLink 직결 (GPUDirect RDMA)

### Fabric

- **정의**: 네트워크 스위치와 HCA로 구성된 전체 상호연결 네트워크
- **토폴로지**: **Fat-Tree**: Leaf-Spine 구조, 서버 간 풀 대역폭 (non-blocking)<br/>**Dragonfly**: 계층적 구조, 장거리 링크 최소화<br/>**Rail-Optimized**: GPU 단위로 전용 스위치 할당 (NVIDIA Quantum-X)
- **주요 스위치**: NVIDIA Quantum-2 (NDR 400Gbps), Arista 7800R4
- **성능 지표**: **Bisection Bandwidth**: 클러스터를 반으로 나눴을 때 대역폭<br/>**Hop Count**: 노드 간 스위치 경유 횟수

---

## 2. GPU 하드웨어

### NVIDIA GPU 세대별 아키텍처
| 세대 | 마이크로아키텍처 | 주요 GPU | Tensor Core | FP8 지원 | 메모리 | NVLink | 출시 |
|------|------------------|----------|-------------|----------|--------|--------|------|
| Ampere | GA100/102 | A100 (80GB), A30 | 3세대 | X | HBM2e | NVLink 3.0 (600GB/s) | 2020 |
| Hopper | GH100 | H100 (80GB), H200 (141GB) | 4세대 | O | HBM3/3e | NVLink 4.0 (900GB/s) | 2022 |
| Blackwell | GB100 | B100, B200 (192GB) | 5세대 | O | HBM3e | NVLink 5.0 (1.8TB/s) | 2024 |
| Rubin | GR100 | R100 | 6세대 | O | HBM4 | NVLink 6.0 (3.6TB/s) | 2026 H2 (예정) |

**핵심 차이점**:
- **H100 vs A100**: FP8 지원 (2배 추론 성능), Transformer Engine, NVLink 대역폭 1.5배
- **B200 vs H100**: NVLink 대역폭 2배, 메모리 2.4배, FP4/FP6 추가

### NVIDIA vs AMD 세대별 맞춤 비교

**세대별 대응 관계**:
```
2020-2021:  NVIDIA A100 (Ampere)    ←→  AMD MI250X (CDNA2)
2022-2023:  NVIDIA H100 (Hopper)    ←→  AMD MI300X (CDNA3)
2024-2025:  NVIDIA B200 (Blackwell) ←→  AMD MI350X (CDNA4)
```

#### 1세대 대결: A100 vs MI250X (2020-2021)
| 항목 | NVIDIA A100 | AMD MI250X | 승자 |
|------|-------------|------------|------|
| **메모리** | 80GB HBM2e, 2.0 TB/s | 128GB HBM2e, 3.2 TB/s | ● AMD (1.6배 많음, 1.6배 빠름) |
| **FP64 (HPC)** | 9.7 TFLOPS | 47.9 TFLOPS | ● AMD |
| **FP16 (AI 학습)** | 312 TFLOPS | 383 TFLOPS | ● AMD |
| **FP8 (AI 추론)** | X 미지원 | X 미지원 | 무승부 |
| **GPU 간 인터커넥트** | NVLink 3.0 (600 GB/s) | Infinity Fabric 3.0 (400 GB/s) | 🟢 NVIDIA (1.5배 빠름) |
| **TDP** | 400W | 560W | 🟢 NVIDIA |
| **소프트웨어** | CUDA (성숙) | ROCm (초기) | 🟢 NVIDIA |
| **가격** | $10-15K | $10-12K | ● AMD |

**결론**: NVIDIA는 CUDA 생태계로 AI 시장 장악, AMD는 HPC(슈퍼컴퓨터) 공략

---

#### 2세대 대결: H100 vs MI300X (2022-2023)
| 항목 | NVIDIA H100 | AMD MI300X | 승자 |
|------|-------------|------------|------|
| **메모리** | 80GB HBM3, 3.35 TB/s<br/>(H200: 141GB, 4.8TB/s) | 192GB HBM3, 5.3 TB/s | ● AMD |
| **FP64 (HPC)** | 34 TFLOPS | 163 TFLOPS | ● AMD |
| **FP8** | 3,958 TFLOPS | 2,614 TFLOPS | 🟢 NVIDIA |
| **FP16** | 1,979 TFLOPS | 1,307 TFLOPS | 🟢 NVIDIA |
| **GPU 간 인터커넥트** | NVLink 4.0 (900 GB/s) | Infinity Fabric 4.0 (896 GB/s) | 🟢 NVIDIA |
| **TDP** | 700W | 750W | 🟢 NVIDIA |
| **특수 기능** | Transformer Engine | APU 통합 메모리 | 각자 차별화 |
| **가격** | $30-40K (H200: $50K+) | $15-20K | ● AMD |

**결론**: NVIDIA는 FP8 추론 성능으로 LLM 추론 시장 선도, AMD는 대용량 메모리로 롱컨텍스트 모델 공략

---

#### 3세대 대결: B200 vs MI350X (2024-2025)
| 항목 | NVIDIA B200 | AMD MI350X | 승자 |
|------|-------------|------------|------|
| **아키텍처** | Blackwell (GB100), TSMC 4NP | CDNA4, TSMC N3P (3nm) | ● AMD |
| **트랜지스터** | 208B | 185B | 🟢 NVIDIA |
| **메모리** | 192GB HBM3e, 8 TB/s | 288GB HBM3e, 8 TB/s | ● AMD |
| **FP8** | 9,000 TFLOPS | ~6,000 TFLOPS (추정) | 🟢 NVIDIA |
| **FP4 지원** | O (MXFP4, MXFP6) | O (MXFP4, MXFP6) | 무승부 (둘 다 지원) |
| **GPU 간 인터커넥트** | NVLink 5.0 (1,800 GB/s) | Infinity Fabric Link (1,120 GB/s) | 🟢 NVIDIA |
| **TDP** | 1,000W (air-cooled) | 1,000W (MI350X, air)<br/>1,400W (MI355X, liquid) | 무승부 |
| **폼팩터** | SXM6 | OAM 2.0 | 각자 표준화 |
| **특수 기능** | NVLink Switch 72-way | 256 CU, 520B+ 파라미터 단일 GPU | ● AMD |
| **가격** | $60-70K | $30-40K (추정) | ● AMD |
| **소프트웨어** | CUDA 13.2+, cuDNN 9.0+ | ROCm 7.2+, MIOpen 3.2+ | 🟢 NVIDIA |

**결론**: NVIDIA는 NVLink 5.0 + FP8 성능 우위, AMD는 288GB 메모리 + 가성비로 롱컨텍스트 모델 공략

**주요 차이점**:
- **메모리**: MI350X의 288GB는 520B+ 파라미터 모델을 단일 GPU에서 실행 가능 (B200은 192GB)
- **인터커넥트**: B200의 NVLink 5.0 (1.8TB/s)이 MI350X Infinity Fabric (1.12TB/s) 대비 1.6배 빠름
- **가격**: MI350X는 B200 대비 50% 저렴 (클라우드 제공자들에게 매력적)

---

**전체 요약**:
- **NVIDIA 강점**: FP8 추론, NVLink 대역폭, CUDA 생태계, Transformer Engine
- **AMD 강점**: 메모리 용량, FP64 HPC, 가격 경쟁력 (NVIDIA 대비 50-60%)
- **시장 점유율**: NVIDIA 90%+ (AI 워크로드), AMD 10%- (HPC/가성비 추구)

### AMD GPU 세대별 아키텍처
| 세대 | 마이크로아키텍처 | 주요 GPU | Matrix Core | FP8 지원 | 메모리 | Infinity Fabric | 출시 |
|------|------------------|----------|-------------|----------|--------|-----------------|------|
| CDNA 2 | CDNA2 | MI250X (128GB) | 2세대 | X | HBM2e | IF 3.0 (400GB/s) | 2021 |
| CDNA 3 | CDNA3 | MI300X (192GB) | 3세대 | O | HBM3 | IF 4.0 (896GB/s) | 2023 |

**특징**:
- **MI300X**: CPU-GPU 통합 패키지, HBM3 192GB (H100 대비 2.4배), ROCm 6.0+
- **MI350X**: CDNA4, 288GB HBM3e, 8TB/s, FP4/FP6 지원, ROCm 7.2+
- **Infinity Fabric**: AMD의 GPU 간 인터커넥트 (NVIDIA NVLink와 유사)

### CUDA vs ROCm

#### CUDA (Compute Unified Device Architecture)

- **정의**: NVIDIA GPU 프로그래밍을 위한 병렬 컴퓨팅 플랫폼 및 프로그래밍 모델
- **개발사**: NVIDIA
- **지원 하드웨어**: NVIDIA GPU 전용 (GeForce, Quadro, Tesla, A100, H100, B200)
- **언어**: CUDA C/C++ (확장 문법), Python (CuPy, Numba), Fortran
- **아키텍처**: Application → CUDA Libraries (cuBLAS, cuDNN, NCCL) → CUDA Runtime API → CUDA Driver API → NVIDIA GPU Driver → Hardware
- **주요 라이브러리**: cuBLAS (선형대수), cuDNN (딥러닝 연산), NCCL (다중 GPU 통신), cuSPARSE (희소 행렬), TensorRT (추론 최적화)
- **장점**: 압도적인 생태계 (PyTorch, TensorFlow, JAX)<br/>성숙한 툴체인 (Nsight, CUDA-GDB, nvprof)<br/>광범위한 문서 및 커뮤니티<br/>최신 GPU 기능 즉시 지원 (Tensor Core, FP8)
- **단점**: NVIDIA GPU에만 종속 (벤더 락인)

#### ROCm (Radeon Open Compute platform)

- **정의**: AMD GPU 및 CPU를 위한 오픈소스 병렬 컴퓨팅 플랫폼
- **개발사**: AMD
- **지원 하드웨어**: AMD GPU (Instinct MI 시리즈, Radeon Pro), AMD CPU (부분 지원)
- **언어**: HIP (Heterogeneous-compute Interface for Portability), OpenCL, OpenMP
- **아키텍처**: Application → ROCm Libraries (rocBLAS, MIOpen, RCCL) → HIP Runtime API → ROCm Runtime → AMD GPU Driver → Hardware
- **주요 라이브러리**: rocBLAS (cuBLAS 대응), MIOpen (cuDNN 대응), RCCL (NCCL 대응), rocFFT (cuFFT 대응), hipify-perl (CUDA 변환)
- **장점**: 오픈소스 (Apache 2.0)<br/>CUDA 코드 포팅 가능 (HIP으로 90%+ 자동 변환)<br/>멀티벤더 지원<br/>클라우드 가성비 (MI300X가 H100 대비 50% 저렴)
- **단점**: CUDA 대비 낮은 성숙도 (버그, 누락 기능)<br/>제한된 프레임워크 지원<br/>작은 문서/커뮤니티<br/>최신 기능 지연 (FP8 지원 1-2년 늦음)

#### CUDA vs ROCm 직접 비교

| 항목 | CUDA | ROCm | 승자 |
|------|------|------|------|
| **지원 하드웨어** | NVIDIA GPU 전용 | AMD GPU, 일부 CPU | 🟢 ROCm |
| **라이선스** | 독점 (Proprietary) | 오픈소스 (Apache 2.0) | 🟢 ROCm |
| **생태계 성숙도** | 압도적 (18년 역사) | 성장 중 (9년 역사) | ● CUDA |
| **프레임워크 지원** | PyTorch O, TensorFlow O, JAX O | PyTorch O, TensorFlow △, JAX △ | ● CUDA |
| **성능 (동급 GPU)** | Baseline | 90-95% (일부 워크로드) | ● CUDA (근소) |
| **CUDA 호환성** | N/A | HIP으로 90%+ 포팅 가능 | 🟢 ROCm |
| **딥러닝 라이브러리** | cuDNN (최적화 OO) | MIOpen | ● CUDA |
| **디버깅 툴** | Nsight, cuda-gdb, nvprof | rocgdb, rocprof | ● CUDA |
| **문서/커뮤니티** | 방대함 | 제한적 | ● CUDA |
| **가격** | GPU 가격 높음 | GPU 가격 낮음 (50% 저렴) | 🟢 ROCm |
| **최신 기능 지원** | 즉시 (FP8, TMA) | 1-2년 지연 | ● CUDA |

**사용 권장 사항**:
- **CUDA 선택**: 
  - 프로덕션 AI 워크로드 (안정성 중요)
  - 최신 GPU 기능 필요 (Transformer Engine, FP4)
  - 광범위한 프레임워크 지원 필요
- **ROCm 선택**:
  - HPC/과학 컴퓨팅 (FP64 성능 중요)
  - 오픈소스 스택 선호
  - 클라우드 비용 절감 (MI300X/MI350X 가성비)
  - CUDA 코드 포팅 가능 (HIP 활용)

**CUDA → ROCm 포팅 예시**:
```bash
# CUDA 코드 (matmul.cu)
__global__ void matmul(float *A, float *B, float *C, int N) {
    int row = blockIdx.y * blockDim.y + threadIdx.y;
    int col = blockIdx.x * blockDim.x + threadIdx.x;
    float sum = 0.0f;
    for (int i = 0; i < N; i++) {
        sum += A[row * N + i] * B[i * N + col];
    }
    C[row * N + col] = sum;
}

# HIP으로 자동 변환
hipify-perl matmul.cu > matmul.hip

# HIP 코드 (차이 거의 없음)
__global__ void matmul(float *A, float *B, float *C, int N) {
    int row = hipBlockIdx_y * hipBlockDim_y + hipThreadIdx_y;  // cuda → hip 접두사만 변경
    int col = hipBlockIdx_x * hipBlockDim_x + hipThreadIdx_x;
    // ... 나머지 동일
}
```

### NIC (Network Interface Card)

- **정의**: 서버를 네트워크에 연결하는 하드웨어 인터페이스
- **RDMA 지원 NIC**: **InfiniBand HCA**: Mellanox ConnectX-7 (NDR 400Gbps), ConnectX-6 Dx (HDR 200Gbps)<br/>**RoCE NIC**: Broadcom P2100G (100Gbps), Marvell FastLinQ (25/100Gbps)<br/>**iWARP NIC**: Intel E810 (100Gbps, TCP/IP 기반 RDMA)
- **일반 이더넷 NIC**: Intel X710 (10Gbps), Mellanox ConnectX-4 Lx (25Gbps)<br/>표준 TCP/UDP 소켓 사용 (커널 스택 경유)
- **통신 프로토콜**: **RDMA**: 레이턴시 1-5μs, CPU 사용률 낮음, 커널 우회<br/>**TCP**: 레이턴시 50-100μs, 신뢰성 보장, 재전송<br/>**UDP**: 레이턴시 10-50μs, 비연결형, 패킷 손실 가능
- **사용 사례**: **RDMA**: NCCL AllReduce, 분산 학습<br/>**TCP**: API 서버, DB 복제<br/>**UDP**: Mooncake KV cache 전송

---

## 3. NCCL & GPU 통신 라이브러리

### NCCL

- **정의**: NVIDIA GPU 간 집합 통신(All-Reduce, All-Gather 등)을 최적화한 라이브러리
- **핵심 알고리즘**: **Ring AllReduce**: 대역폭 효율적, O(N) 통신<br/>**Tree AllReduce**: 레이턴시 효율적, O(log N)<br/>**Double Binary Tree**: NCCL 2.4+ 기본값
- **지원 백엔드**: **NVLink/NVSwitch**: 서버 내 GPU-GPU<br/>**PCIe**: CPU를 거치는 fallback<br/>**InfiniBand/RoCE**: 서버 간 GPU-GPU<br/>**TCP/IP**: 범용 네트워크 (성능 낮음)
- **버전**: NCCL 2.30.4 (2026년 4월)

### NCCL IB Plugin (nccl-rdma-sharp-plugins)

- **정의**: NCCL이 InfiniBand/RoCE를 사용하도록 확장하는 플러그인
- **역할**: RDMA Verbs API를 통해 GPU 메모리 직접 전송 (GPUDirect RDMA)<br/>SHARP 지원<br/>다중 레일(Multi-Rail) 활용 (여러 HCA 동시 사용)
- **설치**: `apt install libnccl-rdma-sharp-plugins`<br/>`export NCCL_IB_HCA=mlx5_0,mlx5_1`<br/>`export NCCL_IB_GID_INDEX=3`
- **성능**: TCP 대비 10배 빠름 (100GB 데이터 전송 시 10초 → 1초)

### NIXL (NVIDIA Inference Xfer Library)

- **정의**: 분산 LLM 추론에서 KV 캐시 텐서를 GPU 간 효율적으로 전송하기 위한 오픈소스 라이브러리 (GTC 2025 공개, `ai-dynamo/nixl`)
- **탄생 배경**: Disaggregated Inference에서 Prefill → Decode 노드 KV 캐시 전송 시 NCCL은 GPU SM 소비, NIXL은 GPUDirect RDMA로 GPU 컴퓨팅 자원 미사용
- **주요 특징**: GPU SM 미사용 (GPUDirect RDMA)<br/>비동기 API (전송/컴퓨팅 오버랩)<br/>플러그인 백엔드 (UCX, GDS/NVMe, S3, NVLink)<br/>메모리 통합 (CPU DRAM, GPU VRAM, NVMe, 오브젝트 스토리지)
- **NCCL과 차이**: **통신 패턴**: Point-to-point (NCCL: Collective)<br/>**GPU SM 사용**: 없음 (NCCL: 있음)<br/>**주 용도**: KV 캐시 전송, 추론 (NCCL: 학습, 텐서 병렬)
- **통합 프레임워크**: NVIDIA Dynamo, TensorRT-LLM, vLLM (`NixlConnector`), SGLang, AWS EFA

---

## 4. 분산 AI 추론

### Mooncake

- **정의**: ByteDance가 개발한 KV Cache 오프로딩 시스템 (분산 추론 최적화)
- **핵심 아이디어**: Prefill GPU와 Decode GPU 분리 + KV Cache 네트워크 전송
- **아키텍처**: Prefill GPU → KV Cache (50GB) → 네트워크 전송 → Decode GPU
- **네트워크 전송 방식**: **NCCL over InfiniBand**: RDMA, 레이턴시 ~1ms<br/>**UDP 직접 전송**: 커널 소켓, 레이턴시 ~5-10ms<br/>**압축 전송**: FP16 → INT8
- **효과**: Prefill/Decode 분리로 GPU 활용률 2배 향상

### Mooncake의 KV Cache 전송

- **KV Cache란?**: Transformer의 Attention 계산 시 이전 토큰의 Key/Value 벡터 저장
- **크기**: LLaMA-70B 모델, 시퀀스 길이 4096 → 약 50GB
- **전송 방법**: **방법 1**: GPUDirect RDMA<br/>**방법 2**: GPU → CPU 메모리 → UDP 소켓 → CPU 메모리 → GPU
- **최적화**: NCCL Group Call로 All-Gather 오버랩<br/>파이프라이닝 (전송 중 다음 토큰 생성)<br/>선택적 전송 (Attention Score 낮은 토큰 제외)

### Mooncake NCCL 통합
- **정의**: Mooncake에서 NCCL을 사용해 KV Cache를 Prefill → Decode GPU로 전송
- **통신 패턴**:
  - **Broadcast**: Prefill GPU 1개 → Decode GPU N개
  - **All-Gather**: 여러 Prefill GPU → 모든 Decode GPU
- **코드 예시** (의사코드):
  ```cpp
  // Prefill GPU
  ncclBroadcast(kv_cache, kv_size, ncclFloat16, 0, comm);
  
  // Decode GPU
  ncclBroadcast(kv_cache, kv_size, ncclFloat16, 0, comm);
  ```
- **성능**: InfiniBand HDR 200Gbps 사용 시 50GB KV Cache 전송 시간 ~2초

### vLLM (Virtual Large Language Model)

- **정의**: UC Berkeley가 개발한 LLM 추론 엔진. 'v'는 가상 메모리(Virtual Memory)에서 착안 — PagedAttention이 핵심
- **핵심 기능**: **PagedAttention**: KV Cache를 페이지 단위 관리<br/>**Continuous Batching**: 토큰 단위 배칭<br/>**Prefix Caching**: 공통 프롬프트 재사용

### vLLM의 Disaggregated Prefill

- **정의**: Prefill과 Decode를 별도 GPU 클러스터로 분리하는 아키텍처
- **배경**: **Prefill**: 긴 입력 처리, Compute-bound (높은 TFLOPS 필요)<br/>**Decode**: 짧은 생성, Memory-bound (높은 메모리 대역폭 필요)
- **구조**: Prefill Cluster (A100, 높은 FP16 성능) → KV Cache 생성 → 네트워크 전송 → Decode Cluster (H100, 높은 메모리 대역폭)
- **네트워크 전송**: gRPC 또는 RDMA
- **효과**: Prefill/Decode GPU를 독립 스케일링, 비용 최적화

### SGLang (Structured Generation Language)

- **정의**: 구조화된 생성 및 복잡한 프롬프트 워크플로우에 최적화된 LLM 추론 엔진
- **개발**: LMSYS (UC Berkeley, UC San Diego, CMU, Stanford)
- **핵심 기술**: **RadixAttention**: Radix Tree 기반 KV Cache 관리<br/>**Structured Generation**: JSON, Regex, CFG 기반 출력 제약<br/>**Frontend Language**: Python DSL로 프롬프트 체인 정의
- **성능 (H100)**: **처리량**: 16,215 tok/s (vLLM 대비 29% 빠름)<br/>**TTFT**: 112ms (vLLM 120ms)<br/>**Prefix-heavy**: vLLM 대비 6.4배 빠름
- **프로덕션**: 400,000+ GPU
- **버전**: SGLang 0.4+ (2026년)

### vLLM vs SGLang 비교

| 항목 | vLLM | SGLang | 승자 |
|------|------|--------|------|
| **핵심 기술** | PagedAttention (고정 크기 블록) | RadixAttention (Radix Tree) | 각자 차별화 |
| **처리량 (H100)** | 12,553 tok/s | 16,215 tok/s | 🟢 SGLang |
| **TTFT (10 req)** | 120ms | 112ms | 🟢 SGLang |
| **Prefix 재사용** | Prefix Caching (수동) | RadixAttention (자동) | 🟢 SGLang |
| **Prefix-heavy 워크로드** | Baseline | 6.4배 빠름 | 🟢 SGLang |
| **하드웨어 지원** | NVIDIA, AMD, TPU, Trainium, Gaudi | NVIDIA, AMD | ● vLLM (더 광범위) |
| **모델 호환성** | 광범위 (encoder-decoder 포함) | Decoder-only LLM | ● vLLM |
| **생태계 성숙도** | 높음 (3배 큰 커뮤니티) | 성장 중 | ● vLLM |
| **Structured Output** | JSON Schema (기본) | JSON, Regex, CFG (고급) | 🟢 SGLang |
| **프로덕션 사례** | Databricks, Anyscale | xAI (Grok 3), Azure | 각자 대규모 |
| **최적 사용처** | 배치 처리, 다양한 하드웨어 | 멀티턴 대화, RAG, Agent | 워크로드별 |

**선택 기준**:

| 워크로드 유형 | SGLang 선택 | vLLM 선택 |
|--------------|------------|-----------|
| **대화 패턴** | 멀티턴 대화, AI 에이전트 | 배치 처리, 독립 프롬프트 |
| **Prefix 공유** | RAG, 공유 prefix 많음 | 고유 프롬프트 많음 |
| **출력 제약** | Structured Output (JSON, Regex) | 자유 형식 생성 |
| **모델 타입** | Decoder-only LLM | Encoder-Decoder 지원 (T5, BART) |
| **하드웨어** | NVIDIA/AMD GPU | NVIDIA/AMD/TPU/Trainium/Gaudi |
| **생태계** | 성장 중 | 성숙 (대규모 커뮤니티) |

**요약**:
- **SGLang**: 채팅봇, RAG, Agent (prefix 재사용 6.4배 빠름)
- **vLLM**: 범용 추론, 다양한 하드웨어, 안정성

### Kernel Socket vs RDMA 비교 (분산 추론 관점)

| 항목 | TCP (Kernel Socket) | UDP (Kernel Socket) | RDMA (InfiniBand/RoCE) |
|------|---------------------|---------------------|------------------------|
| **레이턴시** | 50-100μs | 10-50μs | 1-5μs |
| **대역폭** | ~25Gbps | ~25Gbps | 200-400Gbps |
| **신뢰성** | O 재전송 보장 | X 패킷 손실 가능 | O 보장 (RC) |
| **CPU 사용률** | 높음 (커널 처리) | 높음 (커널 처리) | 낮음 (NIC 오프로드) |
| **구현 난이도** | 낮음 (표준 소켓) | 낮음 (표준 소켓) | 높음 (Verbs API, QP) |
| **커널 경유** | O 커널 스택 | O 커널 스택 | X Kernel Bypass |
| **사용 사례** | API 서버, DB 복제 | Mooncake KV cache 전송 | NCCL, MPI, 분산 학습 |

**Kernel Socket vs RDMA 핵심 차이**:
- **Kernel Socket** (TCP/UDP): 표준 소켓 API (`socket()`, `send()`, `recv()`), 커널 스택 경유
- **RDMA**: Verbs API (`ibv_post_send()`), 커널 우회, NIC가 직접 DMA

**Mooncake가 UDP를 선택한 이유**:
- 간단한 구현 (표준 UDP 소켓)
- RDMA 하드웨어 없이도 동작
- KV Cache 전송 시 일부 패킷 손실 허용 가능 (재생성 비용 낮음)

---

## 5. 커널 & 시스템 레벨

### NIC 커널 드라이버

- **역할**: NIC 하드웨어와 OS 간 인터페이스
- **RDMA 스택**: Application → Verbs API (libibverbs) → RDMA Core (rdma-core) → Kernel Module (mlx5_core, ib_core) → NIC Hardware (ConnectX-7)
- **주요 모듈**: `mlx5_core` (ConnectX-5/6/7 드라이버)<br/>`ib_uverbs` (User-space Verbs)<br/>`rdma_cm` (Connection Manager)
- **확인 방법**: `lsmod \

### GPUDirect RDMA

- **정의**: GPU 메모리와 RDMA NIC 간 직접 DMA (CPU 메모리 우회)
- **동작 원리**: **기존**: GPU → CPU RAM → NIC<br/>**GPUDirect**: GPU → NIC
- **요구사항**: NVIDIA GPU + Mellanox HCA<br/>`nv_peer_mem` 커널 모듈<br/>CUDA 11.0+, NCCL 2.7+
- **성능 향상**: 레이턴시 50% 감소, CPU 사용률 90% 감소

### GID Index

- **정의**: 하나의 HCA 포트가 여러 GID를 가질 때 각 GID의 인덱스
- **확인 방법**: `show_gids` (출력: DEV, PORT, INDEX, GID, IPv4, VER)
- **용도**: NCCL 설정 시 Routable GID 지정 (`NCCL_IB_GID_INDEX=3`)

---

## 버전 정보 요약 (2026년 5월 기준)

| 항목 | 최신 버전 | 릴리스 날짜 |
|------|-----------|-------------|
| **CUDA Toolkit** | 13.2 Update 1 | 2026년 4월 |
| **ROCm** | 7.2.3 (Production) | 2026년 5월 |
| **NCCL** | 2.30.4 (CUDA 12.9) | 2026년 4월 27일 |
| **cuDNN** | 9.0+ | 2025+ |
| **MIOpen** | 3.2+ | 2025+ |
| **NVIDIA GPU** | B200 (출시), Rubin (2026 H2 예정) | 2024, 2026 H2 |
| **AMD GPU** | MI350X (출시) | 2025년 중반 |

---


### 공식 문서
- **CUDA**: [CUDA Toolkit Documentation](https://docs.nvidia.com/cuda/), [CUDA 13.2 Release Notes](https://docs.nvidia.com/cuda/cuda-toolkit-release-notes/)
- **ROCm**: [ROCm Documentation](https://rocm.docs.amd.com/), [ROCm 7.2.3 Release Notes](https://rocm.docs.amd.com/en/latest/about/release-notes.html)
- **NCCL**: [NVIDIA NCCL Documentation](https://docs.nvidia.com/deeplearning/nccl/), [NCCL GitHub](https://github.com/NVIDIA/nccl/releases)
- **RDMA**: [Linux RDMA](https://github.com/linux-rdma/rdma-core)
- **RoCE**: [RoCEv2 Specification](https://www.roceinitiative.org/)
- **vLLM**: [vLLM GitHub](https://github.com/vllm-project/vllm), [vLLM Documentation](https://docs.vllm.ai/)
- **SGLang**: [SGLang GitHub](https://github.com/sgl-project/sglang), [SGLang Documentation](https://sgl-project.github.io/)

### GPU 하드웨어
- **NVIDIA Blackwell**: [DGX B200](https://www.nvidia.com/en-us/data-center/dgx-b200/), [Blackwell Architecture](https://www.nvidia.com/en-us/data-center/technologies/blackwell-architecture/)
- **NVIDIA Rubin**: [Rubin Platform (CES 2026)](https://www.servethehome.com/nvidia-launches-next-generation-rubin-ai-compute-platform-at-ces-2026/)
- **AMD MI350X**: [Instinct MI350X](https://www.amd.com/en/products/accelerators/instinct/mi350/mi350x.html), [MI350X Datasheet](https://www.amd.com/content/dam/amd/en/documents/instinct-tech-docs/product-briefs/amd-instinct-mi350x-gpu-brochure.pdf)
- **NVLink**: [NVLink & NVSwitch](https://www.nvidia.com/en-us/data-center/nvlink/)
- **AMD Infinity Fabric**: [Hot Chips 2025: AMD Infinity Fabric](https://convergedigest.com/hot-chips-2025-amd-boosts-infinity-fabric/)

### 논문
- **Mooncake**: [KVCache-centric Disaggregated Architecture for LLM Serving](https://arxiv.org/abs/2407.00079) (2024)
- **vLLM**: [Efficient Memory Management for Large Language Model Serving with PagedAttention](https://arxiv.org/abs/2309.06180) (2023)
- **SGLang**: [SGLang: Efficient Execution of Structured Language Model Programs](https://arxiv.org/abs/2312.07104) (2023)

### 관련 문서
- [InfiniBand & GPU 인터커넥트 완전 정리](./infiniband-nvlink-nvswitch.md)
- [NVIDIA CUDA 아키텍처](./nvidia-cuda-architecture.md)

---


- **2026-05-14**: SGLang vs vLLM 비교 추가 (RadixAttention vs PagedAttention, 처리량 29% 차이)
- **2026-05-13**: 초안 작성, CUDA 13.2, ROCm 7.2.3, NCCL 2.30.4, MI350X, Rubin 정보 포함

**최종 업데이트**: 2026-05-14 | **버전**: 1.1
