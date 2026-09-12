---
tags:
  - vLLM
  - Kubernetes
  - GPU
  - Device Plugin
  - GPU Operator
  - DRA
  - MIG
  - Accelerator
---

# GPU 스케줄링과 가속기 생태계

> Kubernetes가 Pod에 GPU를 붙여주는 Device Plugin API의 동작 원리부터 NVIDIA GPU Operator, MIG·시분할 공유 방식, NVIDIA 외 가속기 생태계, 그리고 이를 대체해 가는 DRA(Dynamic Resource Allocation)의 진화까지 다이어그램 위주로 정리한다.

## 개요

vLLM 서빙은 결국 GPU 위에서 돈다. 하지만 지금까지 다뤄온 배칭·캐싱·양자화는 모두 **"GPU 한 장 안에서" 일어나는 일**이었다. 실제 프로덕션에서는 그 앞에 한 단계가 더 있다 — Kubernetes 클러스터에 있는 여러 노드, 여러 GPU 중 어떤 것을 어떤 Pod에 줄지 결정하는 **스케줄링 계층**이다.

이 계층은 Kubernetes 코어에 원래 없던 기능이다. CPU·메모리와 달리 GPU는 종류도 다양하고(NVIDIA, AMD, Intel, TPU, ...) 공유 방식도 제각각이라, Kubernetes는 이를 **확장 포인트**로 열어두고 벤더가 직접 구현하게 했다. 이번 글은 그 확장 포인트가 정확히 무엇이고, 어떻게 진화하고 있는지를 다룬다.

## GPU가 Kubernetes 리소스가 되는 방법

Kubernetes 스케줄러는 원래 CPU·메모리만 이해한다. GPU를 Pod가 요청할 수 있는 자원으로 만들어주는 것이 **Device Plugin API**다. 노드에 배포된 Device Plugin이 "이 노드에 GPU가 몇 개 있다"를 kubelet에 등록하면, 그 값이 `Node.status.allocatable`에 반영돼 스케줄러가 참조할 수 있게 된다.

![K8s GPU 스케줄링 전체 흐름](/assets/images/posts/vllm-week6/k8s-gpu-scheduling-flow.svg)

이 그림에서 가장 중요한 지점은 **"몇 개 있는지 광고하는 시점"과 "실제로 어떤 GPU를 줄지 정하는 시점"이 분리돼 있다**는 것이다. Pod가 `resources.limits`에 `nvidia.com/gpu: 1`을 선언하면, 스케줄러는 남은 개수만 보고 노드를 고른다. 어떤 물리 GPU를 배정할지는 Pod가 그 노드에 배치된 **이후**, kubelet이 Device Plugin의 `Allocate()`를 호출할 때 비로소 결정된다.

## Device Plugin API 동작 원리

Device Plugin과 kubelet은 클러스터 API 서버를 거치지 않고 **노드 로컬 유닉스 소켓 위의 gRPC**로 직접 대화한다. 세 개의 메서드가 전부다.

- **Register**: Device Plugin이 시작할 때 자신의 소켓 경로를 kubelet에 등록한다.

- **ListAndWatch**: kubelet이 스트림을 열어 두면, Device Plugin이 디바이스 목록과 헬스 상태를 계속 흘려보낸다. 여기서 받은 개수가 `Node.status.allocatable`에 반영된다.

- **Allocate**: Pod가 실제로 이 노드에 배치되면 kubelet이 호출한다. Device Plugin은 컨테이너에 마운트할 디바이스 경로, 환경 변수, 볼륨 마운트 정보를 응답으로 돌려준다.

![Device Plugin API 동작](/assets/images/posts/vllm-week6/device-plugin-api-sequence.svg)

`Allocate()` 응답을 실제로 컨테이너 안에 반영하는 건 Device Plugin이 아니라 컨테이너 런타임 쪽 몫이다. 예전에는 벤더마다 제각각인 OCI prestart 훅으로 이 작업을 처리했는데, 최근에는 **CDI(Container Device Interface)**라는 표준 스펙으로 정리되는 추세다. `/etc/cdi/nvidia.yaml` 같은 파일에 "이 디바이스를 쓰려면 어떤 파일을 마운트하고 어떤 환경 변수를 심어야 하는지"를 미리 선언해 두면, `runc`가 그 스펙을 그대로 따라 실행한다. Device Plugin이 "몇 개 줄지"를 정한다면, CDI는 "그걸 실제로 어떻게 주입할지"를 표준화한 것이다.

이 API가 다루는 정보는 딱 여기까지다. "GPU가 몇 개 있다"와 "이 컨테이너에 어떤 디바이스를 마운트하라"만 표현할 수 있고, 그 사이에 있는 "어떤 조건의 GPU를 원하는가"는 이 API의 영역이 아니다. 이 한계는 뒤에서 **DRA**로 다시 등장한다.

## NVIDIA GPU Operator

Device Plugin 하나만 배포한다고 GPU가 바로 쓰이는 것은 아니다. 노드 커널에 드라이버가 있어야 하고, 컨테이너 런타임이 그 드라이버를 인식해야 하고, 모니터링도 붙어야 한다. **GPU Operator**는 이 모든 구성 요소를 `ClusterPolicy`라는 CR(Custom Resource) 하나로 묶어 배포하는 오퍼레이터다.

![NVIDIA GPU Operator 구성 요소](/assets/images/posts/vllm-week6/nvidia-gpu-operator-components.svg)

| 구성 요소 | 역할 |
|-----------|------|
| NVIDIA Driver | 노드 커널에 GPU 드라이버를 컨테이너 형태로 설치 |
| Container Toolkit | containerd/CRI-O가 `nvidia-container-runtime` 훅을 쓰도록 연결 |
| Device Plugin | 앞서 본 Device Plugin API의 실제 구현체 |
| DCGM Exporter | Prometheus용 GPU 사용률·온도·ECC 에러 메트릭 노출 |
| GPU Feature Discovery | 노드에 GPU 모델·드라이버 버전을 라벨로 부착 |
| MIG(Multi-Instance GPU) Manager | `ClusterPolicy`에 선언된 MIG 프로파일대로 GPU를 자동 분할 |

여기서 Device Plugin API를 실제로 구현하는 건 표의 6개 중 하나뿐이다. 나머지는 그 하나가 동작할 환경을 채워주는 지원 컴포넌트다. 참고로 이 전체 스택은 **Node Feature Discovery(NFD)**가 노드의 GPU 하드웨어를 먼저 감지해 줘야 Operator가 대상 노드를 인식할 수 있다는 선행 조건이 있다.

## GPU를 여러 워크로드가 나눠 쓰는 방법

GPU 한 장을 여러 Pod가 나눠 쓰는 방법은 격리 경계를 어디에 두느냐에 따라 네 가지로 나뉜다.

![GPU 공유 방식 4가지 비교](/assets/images/posts/vllm-week6/gpu-sharing-methods-comparison.svg)

- **Full GPU**: 격리를 아예 고민하지 않는 방식이다. Pod 하나가 GPU 전체를 점유한다.

- **Time-Slicing**: 여러 Pod가 시간을 나눠 GPU를 순차 점유한다. 소프트웨어 스케줄링일 뿐이라 한 Pod가 메모리를 초과 사용하면 나머지 Pod도 함께 영향받는다.

- **MPS(Multi-Process Service)**: 여러 프로세스의 커널을 동시에 실행하되 메모리 주소 공간은 공유한다. Time-Slicing보다 처리량은 좋지만 한 프로세스의 크래시가 전체에 번질 수 있다.

- **MIG**: GPU 다이 자체를 물리적으로 분할한다. SM(Streaming Multiprocessor)·메모리·캐시가 인스턴스별로 완전히 독립돼, 한쪽 장애가 다른 쪽으로 전혀 넘어가지 않는다.

네 가지 모두 NVIDIA가 제공하는 방식이라 벤더 종속적이다. **HAMi** 같은 오픈소스 프로젝트는 NVIDIA·AMD·Cambricon 등 여러 벤더의 GPU를 동일한 방식으로 가상 메모리·코어 단위까지 나눠 쓸 수 있게 해주는 벤더 중립적인 레이어를 표방한다. 다만 이 글에서는 NVIDIA 생태계 안의 네 가지 방식에 집중한다.

네 방식 중 격리 수준이 가장 높은 MIG만 조금 더 들여다볼 가치가 있다.

## MIG: 하드웨어 파티셔닝

MIG는 Ampere 세대(A100) 이상에서 지원하는 기능으로, 물리 GPU 한 장을 최대 7개의 독립된 GPU 인스턴스로 쪼갠다.

![NVIDIA MIG 파티셔닝 구조](/assets/images/posts/vllm-week6/mig-partitioning-structure.svg)

각 인스턴스는 전용 SM·메모리·캐시·메모리 대역폭을 가지며, Kubernetes에는 `nvidia.com/mig-1g.10gb`처럼 **크기별로 서로 다른 리소스 이름**으로 노출된다. Pod는 "GPU 1개"가 아니라 "메모리 10GB짜리 인스턴스 1개"를 정확히 요청할 수 있게 된다. 이 파티셔닝을 수동 CLI 없이 자동화해 주는 것이 앞서 본 GPU Operator의 MIG Manager다.

## NVIDIA 외 가속기 생태계

Device Plugin API는 NVIDIA 전용이 아니라 **Kubernetes 표준 인터페이스**다. 다른 가속기 벤더도 같은 gRPC 인터페이스를 각자 구현해 클러스터에 꽂는다.

![벤더별 가속기 생태계 지도](/assets/images/posts/vllm-week6/multi-vendor-accelerator-ecosystem.svg)

| 벤더 | 플러그인/오퍼레이터 | 리소스 이름 | 대표 하드웨어 |
|------|---------------------|-------------|----------------|
| NVIDIA | GPU Operator, k8s-device-plugin | `nvidia.com/gpu`, `nvidia.com/mig-*` | A100, H100, L40S |
| AMD | ROCm device plugin, AMD GPU Operator | `amd.com/gpu` | Instinct MI300X 등 |
| Intel | Intel Device Plugins Operator | `gpu.intel.com/i915`, `habana.ai/gaudi` | Flex/Max GPU, Gaudi |
| AWS(EKS) | Neuron device plugin | `aws.amazon.com/neuron` | Trainium, Inferentia |
| Google(GKE) | TPU 전용 디바이스 플러그인(관리형 자동 배포) | `google.com/tpu` | TPU v5e/v6e(Trillium) |

Pod 입장에서 보면 벤더가 바뀌어도 패턴은 동일하다. `resources.limits`에 `<벤더>/<디바이스>: N` 한 줄을 적으면 된다. 차이는 그 뒤에 있다 — MIG 같은 하드웨어 파티셔닝 유무, 오퍼레이터의 성숙도, 관리형 클라우드에 얼마나 통합돼 있는지가 벤더마다 다르다. 특히 Google TPU는 사용자가 직접 플러그인을 설치하는 게 아니라 GKE가 TPU 노드 풀을 만들 때 자동으로 구성해 준다는 점에서 나머지 넷과 운영 방식이 가장 다르다.

NVIDIA와 AWS Neuron을 나란히 놓고 보면 **개입 레벨 자체가 다르다**는 점이 드러난다.

- **NVIDIA**: Device Plugin은 "몇 개 줄지"만 정하고, 실제 주입은 Container Toolkit이 컨테이너 런타임(OCI prestart 훅 또는 CDI) 레벨까지 내려가서 처리한다. 드라이버 라이브러리(`libcuda.so` 등)가 호스트에만 있고 컨테이너 이미지 안에는 없기 때문에, 런타임이 그걸 컨테이너 파일시스템으로 복사·마운트해 줘야 하기 때문이다.

- **AWS Neuron**: 순수하게 **Kubernetes Device Plugin 레벨에서만** 개입한다. Neuron SDK의 유저스페이스 라이브러리는 애초에 pip로 컨테이너 이미지 안에 들어가 있어서, Device Plugin이 `Allocate()` 응답으로 `NEURON_RT_VISIBLE_CORES` 같은 환경 변수만 넣어 주면 끝난다. 별도 컨테이너 런타임 훅이 필요 없다.

Neuron은 여기에 한 가지를 더 얹는다. 기본 kube-scheduler만으로는 어떤 Trainium/Inferentia 칩의 어떤 NeuronCore가 비어 있는지를 세밀하게 고려하기 어렵기 때문에, **Neuron Scheduler Extension**이라는 커스텀 스케줄러(`my-scheduler`)를 별도로 배포해 Pod의 `schedulerName`으로 지정해 쓴다. Device Plugin API 하나로는 부족해서 벤더가 스케줄링 로직 자체를 확장한 사례로, 뒤에서 볼 DRA가 풀려는 문제와 방향이 비슷하다.

## Device Plugin의 한계와 DRA의 등장

Device Plugin API가 표현할 수 있는 건 딱 **"몇 개"**뿐이다. 다음과 같은 요구는 이 API만으로 표현할 방법이 없다.

- 메모리 40GB 이상인 GPU만 달라

- 같은 NVLink 도메인에 있는 GPU 2장을 붙여서 달라

- 여러 Pod가 정책에 따라 GPU 한 장을 나눠 쓰게 해달라

지금까지는 이런 요구를 벤더별 애너테이션이나 어드미션 웹훅으로 우회해 왔다. **DRA**는 이 우회로를 Kubernetes 코어 API로 끌어올린 차세대 방식이다.

![Device Plugin의 구조적 한계 → DRA 등장](/assets/images/posts/vllm-week6/device-plugin-limitations-dra.svg)

DRA는 `resource.k8s.io` API 그룹에 4개의 리소스를 새로 정의한다. Pod는 원하는 조건을 `ResourceClaim`으로 선언하고, `DeviceClass`는 그 조건을 처리할 드라이버를 지정한다. 드라이버는 실제로 존재하는 디바이스 목록을 `ResourceSlice`로 광고하고, 스케줄러가 이 둘을 매칭해 결과를 `ResourceClaim.status`에 기록한다. Device Plugin이 "몇 개"만 말하던 자리에, DRA는 "어떤 조건의 디바이스인지"를 클러스터 API 레벨에서 선언하는 방식을 채워 넣은 셈이다.

## DRA는 어떻게 진화해 왔나

DRA는 한 번에 지금 모습으로 나온 게 아니다. 설계를 한 번 갈아엎고 나서야 안정화됐다.

![DRA 진화 타임라인](/assets/images/posts/vllm-week6/dra-evolution-timeline.svg)

| 버전 | 상태 | 주요 변화 |
|------|------|-----------|
| v1.26 | Alpha | DRA 최초 도입. out-of-tree 컨트롤러 기반의 "Classic DRA" |
| v1.31 | Alpha | Classic DRA가 별도 feature gate(`DRAControlPlaneController`)로 분리 시작 |
| v1.32 | Alpha | **Classic DRA 완전 제거.** 구조화 파라미터(structured parameters) 모델만 사용 |
| v1.33 | Beta | Beta 승격. Partitionable Devices(디바이스를 슬라이스 단위로 광고) 추가 |
| v1.34 | **GA** | `resource.k8s.io/v1` 안정화. Consumable Capacity 추가, Admin Access beta |
| v1.35 | GA | DRA feature gate 기본 활성화 고정(끌 수 없음) |
| v1.36 | GA | 드라이버 생태계 확장 |
| v1.37 | GA | Device Taints & Tolerations GA, Extended Resource 매핑 GA |

가장 중요한 변곡점은 **v1.32**다. 여기서 초기 설계였던 Classic DRA(외부 컨트롤러가 스케줄링에 개입하는 방식)를 완전히 걷어내고 구조화 파라미터 모델 하나로 단순화했다. 이 결정이 있었기 때문에 v1.34에서 별다른 API 파괴 변경 없이 GA로 졸업할 수 있었다. v1.37 기준으로는 기존 Device Plugin 방식의 리소스 이름(`nvidia.com/gpu` 등)을 DRA `DeviceClass`에 그대로 매핑하는 Extended Resource 지원까지 GA에 이르러, 기존 워크로드를 고치지 않고도 백엔드를 DRA로 점진적으로 옮길 수 있는 경로가 마련됐다.

## 두 확장 경로의 공존

정리하면 Kubernetes가 가속기를 다루는 방법은 두 갈래다.

![통합 구조: Device Plugin과 DRA](/assets/images/posts/vllm-week6/device-plugin-vs-dra-architecture.svg)

- **Device Plugin**: 노드 로컬 gRPC, 정적 리소스 이름. 단순하고 대다수 클러스터에서 여전히 기본값이다.

- **DRA**: 클러스터 레벨 API, 조건 기반 클레임. GA(v1.34)에 도달했지만 세밀한 제어가 실제로 필요한 경우에 채택이 늘고 있다.

둘은 경쟁 관계라기보다 과도기의 공존에 가깝다. NVIDIA·AMD 등 주요 벤더는 기존 Device Plugin을 유지하면서 DRA 드라이버를 병행 개발 중이고, 결국 두 경로 모두 같은 벤더 드라이버로 수렴한다.

## 마무리

- Kubernetes 코어는 GPU를 모른다. GPU를 스케줄링 가능한 자원으로 만드는 건 **Device Plugin API**라는 확장 포인트다.

- **GPU Operator**는 새로운 스케줄링 방식이 아니라, Device Plugin이 동작하는 데 필요한 드라이버·런타임·모니터링을 한 CR로 묶어 배포하는 오퍼레이터다.

- GPU 공유는 격리 경계를 어디에 두느냐의 스펙트럼이다. **Time-Slicing → MPS → MIG** 순으로 격리 수준이 올라가고, MIG만 유일하게 하드웨어 자체를 분할한다.

- Device Plugin API는 NVIDIA만의 것이 아니라 **표준 인터페이스**이며, AMD·Intel·AWS·Google이 각자의 방식으로 같은 인터페이스를 구현한다.

- Device Plugin이 표현하지 못하는 "어떤 조건의 디바이스인가"를 채우기 위해 **DRA**가 등장했고, Classic 설계를 한 번 갈아엎은 뒤 v1.34에서 GA에 도달했다.

- 벤더마다 개입 레벨도 다르다. NVIDIA는 컨테이너 런타임까지 내려가 드라이버 라이브러리를 주입하고, AWS Neuron은 순수 Device Plugin 레벨에서 환경 변수만 넣는다. 이런 차이는 Device Plugin API가 정한 최소 규격 위에 벤더가 얼마나 더 쌓아 올리느냐의 문제다.

## 참고

- [Kubernetes Docs - Device Plugins](https://kubernetes.io/docs/concepts/extend-kubernetes/compute-storage-net/device-plugins/)
- [Kubernetes Docs - Dynamic Resource Allocation](https://kubernetes.io/docs/concepts/scheduling-eviction/dynamic-resource-allocation/)
- [Kubernetes v1.34: DRA has graduated to GA](https://kubernetes.io/blog/2025/09/01/kubernetes-v1-34-dra-updates/)
- [Kubernetes v1.34: DRA Consumable Capacity](https://www.kubernetes.io/blog/2025/09/18/kubernetes-v1-34-dra-consumable-capacity/)
- [Kubernetes v1.36: More Drivers, New Features, and the Next Era of DRA](https://kubernetes.io/blog/2026/05/07/kubernetes-v1-36-dra-136-updates/)
- [Kubernetes v1.37: DRA Updates](https://kubernetes.io/blog/2026/09/03/kubernetes-v1-37-dra-updates/)
- [kubernetes/enhancements - DRA: remove "classic DRA"](https://github.com/kubernetes/kubernetes/pull/128003)
- [kubernetes/enhancements - Partitionable Devices KEP](https://github.com/kubernetes/enhancements/tree/master/keps/sig-scheduling/4815-dra-partitionable-devices)
- [NVIDIA GPU Operator Docs](https://docs.nvidia.com/datacenter/cloud-native/gpu-operator/latest/index.html)
- [NVIDIA MIG User Guide](https://docs.nvidia.com/datacenter/tesla/mig-user-guide/)
- [Intel Device Plugins for Kubernetes](https://github.com/intel/intel-device-plugins-for-kubernetes)
- [AWS Neuron Device Plugin](https://awsdocs-neuron.readthedocs-hosted.com/en/latest/containers/index.html)
- [AWS Neuron Documentation](https://awsdocs-neuron.readthedocs-hosted.com/en/latest/)
- [NVIDIA CDI(Container Device Interface) Support](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/cdi-support.html)
- [CNCF - GPU-Enabled Platforms on Kubernetes](https://www.vcluster.com/gpu-enabled-platforms-on-kubernetes)
- [HAMi (Heterogeneous AI Computing Virtualization Middleware)](https://github.com/Project-HAMi/HAMi)
