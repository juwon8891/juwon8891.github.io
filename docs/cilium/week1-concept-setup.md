---
tags:
  - Cilium
  - eBPF
---

# 개념 & 실습 환경 구성

> Cilium의 eBPF 기반 네트워킹 개념과 kind 실습 환경 구성 방법을 정리한다.

## Cilium CNI란?

### 1. Cilium의 정의와 핵심 가치

Cilium은 **eBPF(extended Berkeley Packet Filter)** 기술을 기반으로 구축된 네트워킹, 보안, 그리고 가시성 솔루션이다. 기존의 iptables 기반 네트워킹 솔루션들이 가지고 있던 근본적인 한계를 극복하기 위해 개발된 **CNI(Container Network Interface)** 플러그인으로, 쿠버네티스 환경에서 컨테이너 간의 네트워킹을 담당한다.

![](https://velog.velcdn.com/images/juwon8891/post/ef3561e8-1eba-40fb-8444-00f53bf9491e/image.png)

Cilium이 기존 솔루션들과 차별화되는 핵심 특징은 다음과 같다:

**1) eBPF 네이티브 설계**

- 리눅스 커널 레벨에서 직접 동작하는 eBPF 프로그램을 통해 패킷 처리

- 사용자 공간과 커널 공간 간의 불필요한 데이터 복사 최소화

- 커널 소스 코드 수정 없이도 네트워킹 로직을 동적으로 변경 가능

**2) 고성능 데이터 플레인**

- O(1) 시간 복잡도의 해시맵 기반 룩업 테이블 사용

- XDP(eXpress Data Path)를 활용한 초고속 패킷 처리

- 기존 iptables 대비 향상된 처리량과 낮은 지연시간 제공

**3) API 기반 보안 정책**

- HTTP, gRPC, Kafka 등 애플리케이션 레이어(L7) 프로토콜에 대한 세밀한 보안 정책 적용

- 서비스 메시 수준의 보안 기능을 CNI 레벨에서 제공

- 제로 트러스트 네트워크 아키텍처 구현 지원

## eBPF: Cilium의 핵심 기술

### 1. eBPF의 역사적 배경과 발전

![](https://velog.velcdn.com/images/juwon8891/post/9142f280-20bb-43aa-acde-9da02c5ea8f4/image.png)

**Berkeley Packet Filter(BPF)의 탄생 (1992년)**

- 원래 BPF는 네트워크 패킷을 효율적으로 필터링하기 위한 가상 머신으로 시작

- tcpdump, wireshark 등의 도구에서 패킷 캡처 시 사용되던 제한적인 용도

- 단순한 바이트코드 해석기 방식으로 구현되어 성능과 기능면에서 한계 존재

**eBPF의 진화 (2014년)**

- Alexei Starovoitov가 주도한 eBPF 프로젝트로 BPF가 완전히 재설계됨

- 단순한 패킷 필터에서 범용적인 커널 프로그래밍 플랫폼으로 확장

- JIT(Just-In-Time) 컴파일러 도입으로 네이티브 코드 수준의 성능 달성

- 맵(Map) 자료구조 도입으로 상태 유지 및 사용자 공간과의 데이터 공유 가능

### 2. eBPF의 작동 원리

![](https://velog.velcdn.com/images/juwon8891/post/b2ef7bc1-bfbc-4df2-988a-cadfe4c1264e/image.png)

**eBPF 프로그램 로딩 프로세스:**

1. **컴파일 단계**
   - C 언어로 작성된 eBPF 프로그램을 LLVM/Clang을 통해 eBPF 바이트코드로 컴파일
   - 바이트코드는 eBPF 가상 머신의 명령어 집합으로 구성
   - 64비트 레지스터 기반 아키텍처 사용으로 현대적인 프로세서와 호환성 최적화

2. **검증(Verification) 단계**
   - 커널의 eBPF 검증기(Verifier)가 프로그램의 안전성을 철저히 검사
   - 무한 루프 방지, 메모리 액세스 범위 검증, 타입 안전성 확인
   - 커널 크래시나 보안 취약점을 원천적으로 차단하는 정적 분석 수행

3. **JIT 컴파일 단계**
   - 검증을 통과한 바이트코드를 해당 아키텍처의 네이티브 기계어로 변환
   - x86_64, ARM64, RISC-V 등 다양한 아키텍처별 최적화된 코드 생성
   - 인터프리터 방식 대비 10-20배 향상된 실행 성능 달성

**eBPF 훅(Hook) 포인트:**

![](https://velog.velcdn.com/images/juwon8891/post/821177ca-2910-4faf-9b68-62a5fc07bfec/image.png)

| 훅 포인트 | 설명 |
|-----------|------|
| XDP | 네트워크 드라이버에서 패킷을 받자마자 실행 |
| TC (Traffic Control) | 네트워크 스택의 Ingress/Egress 지점에서 실행 |
| Netfilter | iptables 체인의 각 지점에서 eBPF 프로그램 실행 가능 |
| Socket | 소켓 레벨에서 연결 관리 및 필터링 수행 |
| Tracepoints | 커널 내부의 특정 이벤트 발생 시점에서 실행 |

### 3. eBPF의 장점

**커널 공간에서의 안전한 프로그래밍**

- 기존에는 커널 모듈을 개발하려면 커널 소스를 수정하고 재컴파일해야 했음
- eBPF는 샌드박스 환경에서 실행되어 커널 안정성을 해치지 않으면서도 커널 기능 확장 가능
- 메모리 보호, 타입 안전성, 실행 시간 제한 등 다중 보안 메커니즘 적용

**동적 기능 업데이트**

- 시스템 재부팅이나 서비스 중단 없이 네트워킹 로직을 실시간으로 변경 가능
- A/B 테스트, 점진적 배포(Progressive Rollout) 등 DevOps 방법론과 호환
- 운영 중인 프로덕션 환경에서도 안전하게 새로운 기능 적용 및 롤백 가능

## XDP: 초고속 패킷 처리

### 1. XDP의 개념과 위치

![](https://velog.velcdn.com/images/juwon8891/post/6da7860e-947e-4175-a7aa-695f04577dd6/image.png)

XDP는 eBPF 기술을 활용하여 네트워크 패킷을 가장 빠른 지점에서 처리할 수 있게 해주는 고성능 데이터 경로이다. 기존의 리눅스 네트워크 스택이 패킷을 처리하기 위해 거쳐야 하는 복잡한 단계들을 우회하여, 네트워크 드라이버 레벨에서 바로 패킷을 처리할 수 있게 해준다.

**기존 네트워크 스택의 처리 과정:**

1. 네트워크 카드가 패킷 수신
2. DMA를 통해 커널 메모리로 패킷 복사
3. 네트워크 드라이버에서 패킷 처리
4. 네트워크 스택의 다양한 레이어를 순차적으로 통과
5. 소켓 버퍼에 패킷 저장
6. 애플리케이션에서 패킷 읽기

**XDP 처리 과정:**

1. 네트워크 카드가 패킷 수신
2. 네트워크 드라이버에서 즉시 XDP 프로그램 실행
3. 패킷의 운명 결정 (통과, 드롭, 리다이렉트 등)

### 2. XDP 동작 모드별 분석

![](https://velog.velcdn.com/images/juwon8891/post/2d2bf918-0c67-4ec8-975c-bdd510b9cc2d/image.png)

| 모드 | 설명 |
|------|------|
| Generic XDP | 가장 기본적인 모드로, 모든 네트워크 인터페이스에서 사용 가능. 네트워크 스택의 상위 레이어에서 동작하여 호환성은 높지만 성능은 상대적으로 낮음. 레거시 하드웨어나 개발/테스트 환경에서 주로 사용 |
| Native XDP | 네트워크 드라이버가 직접 XDP를 지원하는 모드. Intel의 i40e, ixgbe, Mellanox의 mlx4, mlx5 등 주요 고성능 네트워크 카드에서 지원. 패킷이 커널의 네트워크 스택에 도달하기 전에 처리되어 최고의 성능 제공 |
| Offloaded XDP | 네트워크 카드의 하드웨어에서 직접 XDP 프로그램을 실행하는 모드. Netronome의 SmartNIC 등 프로그래머블 하드웨어에서 지원. CPU 자원을 전혀 사용하지 않고도 패킷 처리 가능 |

### 3. XDP 액션과 성능 특성

![](https://velog.velcdn.com/images/juwon8891/post/9b220a55-fe14-48fe-967a-2a8b5a43027d/image.png)

| 액션 | 설명 |
|------|------|
| XDP_DROP | 패킷을 즉시 폐기. DDoS 공격 방어에 가장 효과적이며, 초당 수천만 개의 패킷도 효율적으로 처리 가능 |
| XDP_PASS | 패킷을 정상적인 네트워크 스택으로 전달. 패킷 헤더 수정이나 메타데이터 추가 후 상위 레이어로 전송 |
| XDP_TX | 패킷을 수신한 동일한 인터페이스로 다시 전송. 로드 밸런서나 프록시에서 패킷 반사에 사용 |
| XDP_REDIRECT | 패킷을 다른 네트워크 인터페이스나 소켓으로 리다이렉트. 고성능 스위칭이나 터널링 구현에 활용 |

## IPtables vs eBPF: 패러다임의 전환

### 1. IPtables의 근본적인 한계

![](https://velog.velcdn.com/images/juwon8891/post/e8e5455b-5de1-40a1-a4d8-aaf4e04c068e/image.png)

**선형 검색의 성능 문제**

IPtables는 네트워크 패킷이 도착할 때마다 설정된 규칙들을 순차적으로 검사하는 방식으로 동작한다. 이는 규칙의 개수가 증가할수록 처리 시간이 선형적으로 증가하는 O(n) 시간 복잡도를 가지게 된다.

예를 들어, 쿠버네티스 클러스터에서 1000개의 서비스가 실행 중이라면:

- 각 서비스마다 여러 개의 iptables 규칙이 생성됨

- NodePort 서비스, ClusterIP 서비스, LoadBalancer 서비스별로 추가 규칙 필요

- 결과적으로 수만 개의 iptables 규칙이 생성되어 패킷 처리 성능 급격히 저하

**체인 기반 처리의 복잡성**

IPtables는 패킷이 시스템을 통과하는 경로에 따라 5개의 체인으로 나누어 처리한다:

| 체인 | 설명 |
|------|------|
| PREROUTING | 라우팅 결정 이전에 실행되는 규칙들 |
| INPUT | 로컬 프로세스로 향하는 패킷에 대한 규칙들 |
| FORWARD | 다른 호스트로 전달되는 패킷에 대한 규칙들 |
| OUTPUT | 로컬에서 생성된 패킷에 대한 규칙들 |
| POSTROUTING | 라우팅 결정 이후에 실행되는 규칙들 |

각 체인은 다시 filter, nat, mangle, raw 등의 테이블로 분류되어, 하나의 패킷이 시스템을 통과하는 동안 수십 개의 규칙 체인을 거쳐야 한다.

**규칙 관리의 어려움**

대규모 쿠버네티스 환경에서는 다음과 같은 문제들이 발생한다:

- 동적으로 생성/삭제되는 Pod와 Service에 대한 규칙 관리

- 규칙 간의 우선순위와 의존성 관리

- 디버깅과 트러블슈팅의 복잡성

- 원자적(Atomic) 업데이트의 어려움

### 2. eBPF의 해결 방안

![](https://velog.velcdn.com/images/juwon8891/post/6bd9a967-30bc-4e3f-a470-7a10f1caaa08/image.png)

**해시맵 기반 O(1) 룩업**

eBPF는 해시맵(Hash Map) 자료구조를 사용하여 모든 룩업 작업을 상수 시간에 처리한다:

```c
// eBPF 맵 정의 예제
struct bpf_map_def SEC("maps") service_map = {
    .type = BPF_MAP_TYPE_HASH,
    .key_size = sizeof(struct service_key),
    .value_size = sizeof(struct service_value),
    .max_entries = 65536,
};
```

- 서비스 개수가 10개든 10만 개든 룩업 시간은 동일
- 평균적으로 iptables 대비 10-100배 빠른 패킷 처리 성능
- 메모리 사용량도 효율적으로 최적화

**컴파일된 바이트코드의 효율성**

IPtables 규칙은 런타임에 해석되는 반면, eBPF 프로그램은 미리 컴파일된 바이트코드로 실행된다:

1. **컴파일 시점 최적화**: 불필요한 분기문 제거, 루프 언롤링 등
2. **JIT 컴파일**: 실행 시점에 네이티브 기계어로 변환되어 최고 성능 달성
3. **인라인 함수**: 함수 호출 오버헤드 최소화

**프로그래머블 네트워킹**

eBPF는 네트워크 동작을 코드로 정의할 수 있어 무한한 확장성을 제공한다:

- 사용자 정의 로드 밸런싱 알고리즘 구현
- 실시간 트래픽 분석 및 이상 탐지
- 애플리케이션별 맞춤형 네트워킹 로직 적용

### 3. 성능 벤치마크 비교

![](https://velog.velcdn.com/images/juwon8891/post/68ffdb0c-5933-4d76-b3ca-d23de5100dff/image.png)

![](https://velog.velcdn.com/images/juwon8891/post/d02273ed-ab6a-463e-a179-48012f744f1d/image.png)

![](https://velog.velcdn.com/images/juwon8891/post/7234340a-347c-419c-aecd-841844007697/image.png)

| 항목 | IPtables | eBPF/XDP |
|------|----------|----------|
| 패킷 처리량 | 초당 약 50만-100만 패킷 (규칙 개수에 따라 변동) | 초당 2000만-5000만 패킷 (안정적인 성능) |
| 지연 시간 | 평균 100-500 마이크로초 (규칙 복잡도에 따라 증가) | 평균 1-10 마이크로초 (일정한 성능) |
| CPU 사용률 | 높음 (특히 규칙이 많을 때) | 낮고 일정함 |

## Cilium 네트워크 아키텍처

### 1. 네트워크 모드별 구현

![](https://velog.velcdn.com/images/juwon8891/post/739904c5-3cf8-4f54-860a-8565e7f85641/image.png)

#### 1.1 터널 모드 (Tunneling Mode)

**VXLAN 기반 오버레이 네트워크**

터널 모드는 가상화된 네트워크 오버레이를 구성하여 Pod 간 통신을 제공하는 방식이다. 이 모드에서 Cilium은 VXLAN(Virtual eXtensible LAN) 또는 Geneve 프로토콜을 사용하여 L2 오버 L3 터널을 생성한다.

**VXLAN 동작 원리:**

1. **VNI(VXLAN Network Identifier) 할당**
   - 각 클러스터마다 고유한 VNI 값이 할당됨 (기본값: 자동 생성)
   - VNI를 통해 서로 다른 테넌트나 클러스터 간의 네트워크 격리 보장
   - 24비트 식별자로 최대 1600만 개의 독립적인 네트워크 세그먼트 지원

2. **VTEP(VXLAN Tunnel Endpoint) 설정**
   - 각 Cilium 노드가 VTEP 역할을 수행하여 터널 엔드포인트 제공
   - cilium_vxlan 인터페이스가 생성되어 VXLAN 트래픽 처리
   - 노드 간 UDP 8472 포트를 통한 터널 통신 수행

3. **패킷 캡슐화 과정**
   ```
   원본 패킷: [Pod A IP][Pod B IP][DATA]
   ↓
   VXLAN 캡슐화: [Node A IP][Node B IP][VXLAN Header][Pod A IP][Pod B IP][DATA]
   ```

#### 1.2 네이티브 라우팅 모드 (Native Routing Mode)

![](https://velog.velcdn.com/images/juwon8891/post/26a87961-dc26-4423-9793-ef787cc0b87c/image.png)

네이티브 라우팅 모드는 오버레이 캡슐화 없이 언더레이 네트워크의 라우팅 테이블을 직접 활용하는 고성능 모드이다.

**직접 라우팅 메커니즘**

1. **라우팅 테이블 조작**
   - Cilium이 각 노드의 커널 라우팅 테이블에 Pod CIDR 경로를 직접 추가
   - 목적지 Pod CIDR에 따라 해당 노드로 직접 라우팅
   - BGP, OSPF 등 기존 라우팅 프로토콜과의 통합 가능

2. **Auto Direct Node Routes**
   ```bash
   # 예시 라우팅 테이블
   10.244.1.0/24 via 192.168.10.101 dev eth1  # k8s-w1 노드의 Pod CIDR
   10.244.2.0/24 via 192.168.10.102 dev eth1  # k8s-w2 노드의 Pod CIDR
   ```

3. **Cross-Subnet 지원**
   - 서로 다른 서브넷에 있는 노드 간에도 직접 라우팅 지원
   - directRoutingSkipUnreachable 옵션으로 L2 연결성 확인

**성능 최적화 특성**

| 항목 | 설명 |
|------|------|
| 캡슐화 오버헤드 제거 | VXLAN/Geneve 헤더 추가/제거 과정 생략 |
| MTU 효율성 | 캡슐화로 인한 MTU 감소 문제 해결 |
| CPU 사용률 감소 | 패킷 처리 단계 단순화로 CPU 자원 절약 |
| 지연시간 최소화 | 네트워크 홉 수 감소로 지연시간 개선 |

### 2. IPAM (IP Address Management) 시스템

#### 2.1 Kubernetes Host Scope IPAM

**kube-controller-manager 기반 IPAM**

이 모드에서는 쿠버네티스의 기본 IPAM 메커니즘을 그대로 활용한다:

1. **Node CIDR 할당 과정**
   ```bash
   # kube-controller-manager 설정 확인
   kubectl describe pod kube-controller-manager-master -n kube-system
   ```

   주요 설정 파라미터:
   - `--allocate-node-cidrs=true`: 노드별 CIDR 자동 할당 활성화
   - `--cluster-cidr=10.244.0.0/16`: 전체 클러스터 Pod CIDR 범위
   - `--node-cidr-mask-size=24`: 각 노드에 할당되는 서브넷 크기

2. **정적 IP 범위 관리**
   - 각 노드는 고정된 /24 서브넷을 할당받음
   - Pod 생성 시 해당 노드의 CIDR 범위 내에서 IP 순차 할당
   - 노드 추가/제거 시 CIDR 재할당 불가능 (정적 구조)

**장점과 제한사항**

장점:

- 쿠버네티스 네이티브 방식으로 완벽한 호환성
- 기존 kubeadm 클러스터와 즉시 통합 가능
- IPAM 관련 추가 설정 불필요

제한사항:

- IP 범위 효율성 부족 (노드별 고정 할당)
- 동적 CIDR 확장 불가능
- 대규모 클러스터에서 IP 고갈 가능성

#### 2.2 Cluster Scope IPAM

![](https://velog.velcdn.com/images/juwon8891/post/76e28c58-beca-4936-95b9-906e4dc675d4/image.png)

**동적 IP 풀 관리**

Cluster Scope 모드는 Cilium이 자체적으로 IP 주소 풀을 관리하는 유연한 IPAM 시스템이다:

1. **CiliumNode CRD 활용**
   ```yaml
   apiVersion: cilium.io/v2
   kind: CiliumNode
   metadata:
     name: k8s-worker-1
   spec:
     ipam:
       podCIDRs:
       - "10.0.1.0/24"
       - "10.0.2.0/24"  # 동적 확장 가능
     addresses:
     - ip: "192.168.10.101"
       type: "InternalIP"
   ```

2. **IP 풀 설정**
   ```bash
   # Cilium 설정 확인
   cilium config view | grep cluster-pool
   cluster-pool-ipv4-cidr: 10.0.0.0/8
   cluster-pool-ipv4-mask-size: 24
   ```

**고급 IPAM 기능들**

![](https://velog.velcdn.com/images/juwon8891/post/12186b54-d0fe-4919-a7f5-4e38b2d479e3/image.png)

| 기능 | 설명 |
|------|------|
| Multi-Pool IPAM (Beta) | 여러 IP 풀에서 동적 CIDR 할당. 노드별로 서로 다른 IP 범위 사용 가능. 워크로드 특성에 따른 IP 세그멘테이션 지원 |
| IP 풀 자동 확장 | Pod 수 증가에 따른 자동 CIDR 추가 할당. IP 고갈 시 새로운 서브넷 자동 할당. 비효율적인 IP 사용 최소화 |

### 3. Kube-proxy 완전 대체 메커니즘

![](https://velog.velcdn.com/images/juwon8891/post/84eb4f5c-3c8d-4991-91b2-ae8b7ccbeccb/image.png)

#### 3.1 eBPF 기반 Service 로드밸런싱

**eBPF 맵을 활용한 Service 구현**

Cilium은 kube-proxy의 iptables 기반 Service 구현을 완전히 대체하여 eBPF 기반의 고성능 로드밸런싱을 제공한다:

1. **Service Map 구조**
   ```c
   // Service 정보를 저장하는 eBPF 맵
   struct service_key {
       __be32 address;    // Service ClusterIP
       __be16 dport;      // Service Port
       __u8 proto;        // 프로토콜 (TCP/UDP)
   };
   
   struct service_value {
       __u32 count;       // Backend 개수
       __u32 flags;       // Service 플래그
       __u32 rev_nat_id;  // 역방향 NAT ID
   };
   ```

2. **Backend Map 구조**
   ```c
   // Backend Pod 정보를 저장하는 eBPF 맵
   struct backend_key {
       __u32 backend_id;
   };
   
   struct backend_value {
       __be32 address;    // Pod IP
       __be16 port;       // Pod Port
       __u8 proto;        // 프로토콜
       __u32 flags;       // Backend 상태
   };
   ```

#### 3.2 성능 최적화 기법

![](https://velog.velcdn.com/images/juwon8891/post/9af05ba8-466c-4a3d-902a-b7f244073117/image.png)

**Socket-level Load Balancing**

```bash
# Socket LB 활성화
cilium config set socket-lb-enabled true
```

- 소켓 레벨에서 로드밸런싱 수행
- 애플리케이션 레벨에서 더 정확한 로드밸런싱
- connect() 시스템 콜 레벨에서 백엔드 선택

**BPF Host Routing**

커널 네트워크 스택을 우회하는 고성능 라우팅:

- TC ingress hook 활용
- 네트워크 스택 처리 단계 최소화
- 노드 간 트래픽 성능 최대 50% 향상

## 실습 환경 구성

### 1. 시스템 요구사항

#### 1.1 하드웨어 및 소프트웨어 요구사항

m1 macOS26 에서 VirtualBox + Vagrant가 제대로 실행되지 않아서, Vmware Fusion으로 실습했다.

**CPU 아키텍처 요구사항**

Cilium은 현대적인 CPU 아키텍처에서 최적화된 성능을 제공한다:

```bash
# CPU 아키텍처 확인
arch
# 출력 예시: x86_64 또는 aarch64

# CPU 정보 상세 확인
cat /proc/cpuinfo | grep -E 'model name|flags' | head -5

# eBPF JIT 컴파일러 지원 확인
grep -i bpf /proc/cpuinfo
```

| 아키텍처 | 설명 |
|----------|------|
| x86_64 (AMD64) | 가장 널리 사용되며 모든 기능 완전 지원 |
| AArch64 (ARM64) | ARM 기반 서버 및 클라우드 인스턴스 지원 |
| RISC-V | 실험적 지원 (개발 환경용) |

**리눅스 커널 버전별 기능 지원**

```bash
# 현재 커널 버전 확인
uname -r

# 커널 컴파일 날짜 및 정보 확인
uname -a

# 커널 소스 버전 정보
cat /proc/version
```

| 커널 버전 | 주요 지원 기능 |
|----------|---------------|
| 4.8+ | 기본 eBPF 및 XDP 지원 |
| 4.14+ | 안정적인 BPF helper 함수 |
| 5.0+ | BPF 스핀락, BTF 지원 |
| 5.4+ | CO-RE (Compile Once, Run Everywhere) |
| 5.6+ | WireGuard 투명 암호화 |
| 5.7+ | Session Affinity 완전 지원 |
| 5.8+ | L3 디바이스 지원 |
| 5.10+ | BPF 기반 호스트 라우팅 |

#### 1.2 필수 커널 설정 옵션

**기본 eBPF 지원 확인**

```bash
# BPF 기본 기능 확인
grep -E 'CONFIG_BPF=|CONFIG_BPF_SYSCALL=|CONFIG_NET_CLS_BPF=|CONFIG_BPF_JIT=' /boot/config-$(uname -r)

# 예상 출력:
# CONFIG_BPF=y
# CONFIG_BPF_SYSCALL=y  
# CONFIG_BPF_JIT=y
# CONFIG_NET_CLS_BPF=m

# 고급 BPF 기능 확인
grep -E 'CONFIG_CGROUP_BPF=|CONFIG_BPF_EVENTS=|CONFIG_BPF_STREAM_PARSER=' /boot/config-$(uname -r)

# ONFIG_BPF_STREAM_PARSER=' /boot/config-$(uname -r)
# CONFIG_CGROUP_BPF=y
# CONFIG_BPF_STREAM_PARSER=y
# CONFIG_BPF_EVENTS=y
```

**네트워킹 및 터널링 지원**

```bash
# 터널링 프로토콜 지원 확인
grep -E 'CONFIG_VXLAN=|CONFIG_GENEVE=|CONFIG_IPIP=|CONFIG_IP6_NF_IPTABLES=' /boot/config-$(uname -r)

# 고급 네트워킹 기능
grep -E 'CONFIG_NET_CLS_ACT=|CONFIG_NET_SCH_INGRESS=|CONFIG_NET_ACT_BPF=' /boot/config-$(uname -r)

# 실제 모듈 로딩 상태 확인
lsmod | grep -E 'vxlan|geneve|bpf'
```

**보안 및 정책 기능**

```bash
# L7 정책 및 FQDN 기능을 위한 설정
grep -E 'CONFIG_NETFILTER_XT_TARGET_TPROXY=|CONFIG_NETFILTER_XT_TARGET_MARK=|CONFIG_NETFILTER_XT_MATCH_MARK=' /boot/config-$(uname -r)

# 컨테이너 보안 기능
grep -E 'CONFIG_NET_CLS_CGROUP=|CONFIG_CGROUP_NET_PRIO=' /boot/config-$(uname -r)
```

#### 1.3 eBPF 파일시스템 및 권한 설정

**eBPF 파일시스템 마운트 확인**

```bash
# eBPF 파일시스템 마운트 상태 확인
mount | grep bpf
# 예상 출력: bpf on /sys/fs/bpf type bpf (rw,nosuid,nodev,noexec,relatime,mode=700)

# 수동으로 마운트하기 (필요시)
sudo mount -t bpf bpf /sys/fs/bpf

# 영구적으로 마운트 설정
echo 'bpf /sys/fs/bpf bpf defaults 0 0' | sudo tee -a /etc/fstab
```

**Cilium 동작에 필요한 권한**

```bash
# 현재 사용자의 권한 확인
id

# Cilium이 필요로 하는 capabilities 확인
getcap /usr/bin/cilium 2>/dev/null || echo "Cilium not installed yet"

# 시스템 리미트 확인
ulimit -l  # 메모리 락 제한
ulimit -n  # 파일 디스크립터 제한
```

### 2. 실습 환경 구성

#### 2.1 Vagrant 기반 실습 환경

![](https://velog.velcdn.com/images/juwon8891/post/ae874846-b149-4e81-9083-a9e49da7ce8a/image.png)

**실습 환경 아키텍처**

실습을 위한 3노드 쿠버네티스 클러스터는 다음과 같이 구성된다:

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   k8s-ctr       │    │    k8s-w1       │    │    k8s-w2       │
│ (Control Plane) │    │  (Worker Node)  │    │  (Worker Node)  │
├─────────────────┤    ├─────────────────┤    ├─────────────────┤
│ eth0: 10.0.2.15 │    │ eth0: 10.0.2.15 │    │ eth0: 10.0.2.15 │
│ eth1:192.168.10.│    │ eth1:192.168.10.│    │ eth1:192.168.10.│
│      100        │    │      101        │    │      102        │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    Host-Only Network (192.168.10.0/24)
```

**네트워크 인터페이스 구성**

| 인터페이스 | 역할 |
|-----------|------|
| eth0 (NAT Network) | 모든 노드가 동일한 IP (10.0.2.15) 사용. VirtualBox NAT를 통한 외부 인터넷 접속. 패키지 다운로드 및 외부 통신용 |
| eth1 (Host-Only Network) | 각 노드별 고유 IP 할당. 클러스터 내부 통신 전용. Cilium 네트워킹의 기본 인터페이스 |

#### 2.2 Vagrantfile 구성

```ruby
# Vagrantfile 주요 구성 요소 설명
Vagrant.configure("2") do |config|
  # 기본 박스 이미지 - Ubuntu 24.04 LTS
  config.vm.box = "ubuntu/noble64"
  
  # 각 노드별 설정
  (1..3).each do |i|
    config.vm.define "k8s-#{i == 1 ? 'ctr' : "w#{i-1}"}" do |node|
      # 메모리 및 CPU 할당
      node.vm.provider "virtualbox" do |vb|
        vb.memory = i == 1 ? "4096" : "2048"  # Control Plane: 4GB, Worker: 2GB
        vb.cpus = 2
        vb.customize ["modifyvm", :id, "--nested-hw-virt", "on"]  # 중첩 가상화 지원
      end
      
      # 네트워크 설정
      node.vm.network "private_network", ip: "192.168.10.#{99+i}"
      
      # 프로비저닝 스크립트 실행
      node.vm.provision "shell", path: "init_cfg.sh", args: ["1.33.2-1.1", "5:27.3.0-1~ubuntu.24.04~noble"]
      
      if i == 1
        node.vm.provision "shell", path: "k8s-ctr.sh", args: ["2"]
      else
        node.vm.provision "shell", path: "k8s-w.sh"
      end
    end
  end
end
```

#### 2.3 초기 프로비저닝 스크립트

**init_cfg.sh 스크립트 핵심 기능**

```bash
#!/usr/bin/env bash

echo ">>>> Initial Config Start <<<<"

# 1. 시스템 기본 설정
echo "[TASK 1] Setting Profile & Change Timezone"
echo 'alias vi=vim' >> /etc/profile
echo "sudo su -" >> /home/vagrant/.bashrc
ln -sf /usr/share/zoneinfo/Asia/Seoul /etc/localtime

# 2. 보안 기능 비활성화 (실습 환경용)
echo "[TASK 2] Disable AppArmor & UFW"
systemctl stop ufw && systemctl disable ufw >/dev/null 2>&1
systemctl stop apparmor && systemctl disable apparmor >/dev/null 2>&1

# 3. 스왑 비활성화 (쿠버네티스 요구사항)
echo "[TASK 3] Disable and turn off SWAP"
swapoff -a && sed -i '/swap/s/^/#/' /etc/fstab

# 4. 쿠버네티스 패키지 저장소 설정
echo "[TASK 4] Install Packages"
apt update -qq >/dev/null 2>&1
apt-get install apt-transport-https ca-certificates curl gpg -y -qq >/dev/null 2>&1

# 쿠버네티스 공식 GPG 키 등록
K8SMMV=$(echo $1 | sed -En 's/^([0-9]+\.[0-9]+)\..*/\1/p')
curl -fsSL https://pkgs.k8s.io/core:/stable:/v$K8SMMV/deb/Release.key | sudo gpg --dearmor -o /etc/apt/keyrings/kubernetes-apt-keyring.gpg

# Docker GPG 키 등록
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc

# 5. 네트워크 설정 (IP 포워딩 및 브리지 필터링)
echo "[TASK 5] Configure Network Settings"
echo 1 > /proc/sys/net/ipv4/ip_forward
echo "net.ipv4.ip_forward = 1" >> /etc/sysctl.d/k8s.conf

# 브리지 네트워크 필터링 활성화
modprobe br_netfilter
modprobe overlay
echo "br_netfilter" >> /etc/modules-load.d/k8s.conf
echo "overlay" >> /etc/modules-load.d/k8s.conf

# 6. 컨테이너 런타임 및 쿠버네티스 설치
echo "[TASK 6] Install Kubernetes components"
apt update >/dev/null 2>&1
apt-get install -y kubelet=$1 kubectl=$1 kubeadm=$1 containerd.io=$2 >/dev/null 2>&1
apt-mark hold kubelet kubeadm kubectl >/dev/null 2>&1

# containerd 설정
containerd config default > /etc/containerd/config.toml
sed -i 's/SystemdCgroup = false/SystemdCgroup = true/g' /etc/containerd/config.toml

# crictl 설정
cat <<EOF > /etc/crictl.yaml
runtime-endpoint: unix:///run/containerd/containerd.sock
image-endpoint: unix:///run/containerd/containerd.sock
EOF

# 7. 서비스 시작
systemctl restart containerd && systemctl enable containerd
systemctl enable --now kubelet

echo ">>>> Initial Config End <<<<"
```

**k8s-ctr.sh (Control Plane 설정)**

```bash
#!/usr/bin/env bash

echo ">>>> K8S Controlplane config Start <<<<"

# 1. kubeadm을 통한 클러스터 초기화
echo "[TASK 1] Initial Kubernetes"
kubeadm init \
  --token 123456.1234567890123456 \
  --token-ttl 0 \
  --pod-network-cidr=10.244.0.0/16 \
  --service-cidr=10.96.0.0/16 \
  --apiserver-advertise-address=192.168.10.100 \
  --cri-socket=unix:///run/containerd/containerd.sock >/dev/null 2>&1

# 2. kubectl 설정
echo "[TASK 2] Setting kube config file"
mkdir -p /root/.kube
cp -i /etc/kubernetes/admin.conf /root/.kube/config
chown $(id -u):$(id -g) /root/.kube/config

# 3. 편의성 설정
echo "[TASK 3] Configure kubectl shortcuts"
echo 'source <(kubectl completion bash)' >> /etc/profile
echo 'alias k=kubectl' >> /etc/profile
echo 'alias kc=kubecolor' >> /etc/profile
echo 'complete -F __start_kubectl k' >> /etc/profile

# 4. 관리 도구 설치
echo "[TASK 4] Install kubectl extensions"
git clone https://github.com/ahmetb/kubectx /opt/kubectx >/dev/null 2>&1
ln -s /opt/kubectx/kubens /usr/local/bin/kubens
ln -s /opt/kubectx/kubectx /usr/local/bin/kubectx

# 5. 프롬프트 설정 (현재 컨텍스트 표시)
git clone https://github.com/jonmosco/kube-ps1.git /root/kube-ps1 >/dev/null 2>&1
cat <<"EOT" >> /root/.bash_profile
source /root/kube-ps1/kube-ps1.sh
KUBE_PS1_SYMBOL_ENABLE=true
PS1='$(kube_ps1)'$PS1
EOT

# 6. 호스트 파일 설정
echo "192.168.10.100 k8s-ctr" >> /etc/hosts
for ((i=1; i<=$1; i++)); do 
  echo "192.168.10.10$i k8s-w$i" >> /etc/hosts
done

echo ">>>> K8S Controlplane Config End <<<<"
```

#### 2.4 실습 환경 배포 및 검증

**1단계: 실습 환경 다운로드 및 배포**

```bash
# 실습 디렉토리 생성
mkdir -p ~/cilium-lab && cd ~/cilium-lab

# Vagrantfile 다운로드
curl -O https://raw.githubusercontent.com/gasida/vagrant-lab/refs/heads/main/cilium-study/1w/Vagrantfile

# 프로비저닝 스크립트 다운로드
curl -O https://raw.githubusercontent.com/gasida/vagrant-lab/refs/heads/main/cilium-study/1w/init_cfg.sh
curl -O https://raw.githubusercontent.com/gasida/vagrant-lab/refs/heads/main/cilium-study/1w/k8s-ctr.sh  
curl -O https://raw.githubusercontent.com/gasida/vagrant-lab/refs/heads/main/cilium-study/1w/k8s-w.sh

# 실행 권한 부여
chmod +x *.sh

# 가상머신 시작 (약 15-20분 소요)
vagrant up

# 배포 상태 확인
vagrant status
```

**2단계: 클러스터 상태 확인**

```bash
# Control Plane 노드 접속
vagrant ssh k8s-ctr

# 클러스터 정보 확인
kubectl cluster-info

# 노드 상태 확인 (NotReady 상태 - CNI 미설치)
kubectl get nodes -owide

# 시스템 Pod 상태 확인
kubectl get pods -n kube-system -owide

NAME                              READY   STATUS    RESTARTS   AGE   IP               NODE      NOMINATED NODE   READINESS GATES
coredns-674b8bbfcf-btdf5          0/1     Pending   0          37m   <none>           <none>    <none>           <none>
coredns-674b8bbfcf-xlndh          0/1     Pending   0          37m   <none>           <none>    <none>           <none>
etcd-k8s-ctr                      1/1     Running   0          37m   172.16.126.132   k8s-ctr   <none>           <none>
kube-apiserver-k8s-ctr            1/1     Running   0          37m   172.16.126.132   k8s-ctr   <none>           <none>
kube-controller-manager-k8s-ctr   1/1     Running   0          37m   172.16.126.132   k8s-ctr   <none>           <none>
kube-proxy-b6tqn                  1/1     Running   0          37m   172.16.126.132   k8s-ctr   <none>           <none>
kube-scheduler-k8s-ctr            1/1     Running   0          37m   172.16.126.132   k8s-ctr   <none>           <none>

```

#### 2.5 노드 IP 설정 최적화

**Internal IP 변경의 필요성**

기본적으로 kubelet은 eth0 인터페이스의 IP(10.0.2.15)를 INTERNAL-IP로 사용하는데, 이는 모든 노드가 동일하여 문제를 야기한다. eth1 인터페이스의 고유 IP를 사용하도록 변경해야 한다.

**Control Plane 노드 설정**

```bash
# k8s-ctr 노드에서 실행
vagrant ssh k8s-ctr

# 현재 kubelet 설정 확인
cat /var/lib/kubelet/kubeadm-flags.env

# eth1 IP 자동 감지
NODEIP=$(ip -4 addr show eth1 | grep -oP '(?<=inet\s)\d+(\.\d+){3}')
echo "Detected Node IP: $NODEIP"

# kubelet 설정 수정
sed -i "s/^\(KUBELET_KUBEADM_ARGS=\"\)/\1--node-ip=${NODEIP} /" /var/lib/kubelet/kubeadm-flags.env

# 변경된 설정 확인
cat /var/lib/kubelet/kubeadm-flags.env

# kubelet 서비스 재시작
systemctl daemon-reexec
systemctl restart kubelet

# 변경 확인 (약 1-2분 후)
kubectl get nodes -owide
```

**Worker 노드들 설정**

```bash
# 각 Worker 노드에서 동일하게 실행
for node in w1 w2; do
  echo "=== Configuring k8s-$node ==="
  vagrant ssh k8s-$node -c '
    NODEIP=$(ip -4 addr show eth1 | grep -oP "(?<=inet\s)\d+(\.\d+){3}")
    echo "Node IP: $NODEIP"
    sudo sed -i "s/^\(KUBELET_KUBEADM_ARGS=\"\)/\1--node-ip=${NODEIP} /" /var/lib/kubelet/kubeadm-flags.env
    sudo systemctl daemon-reexec
    sudo systemctl restart kubelet
  '
done

# 모든 노드의 INTERNAL-IP 확인
kubectl get nodes -owide
```

**Static Pod IP 설정 확인**

```bash
# k8s-ctr에서 static pod 설정 확인
ls -la /etc/kubernetes/manifests/

# 재부팅 후 static pod들의 IP가 자동으로 변경되는지 확인
sudo reboot

# 재접속 후 확인
vagrant ssh k8s-ctr

kubectl get pod -n kube-system -owide

NAME                              READY   STATUS    RESTARTS      AGE     IP               NODE      NOMINATED NODE   READINESS GATES
etcd-k8s-ctr                      1/1     Running   1 (80s ago)   2m27s   192.168.10.100   k8s-ctr   <none>           <none>
kube-apiserver-k8s-ctr            1/1     Running   1 (80s ago)   2m27s   192.168.10.100   k8s-ctr   <none>           <none>
kube-controller-manager-k8s-ctr   1/1     Running   1 (80s ago)   2m27s   192.168.10.100   k8s-ctr   <none>           <none>
kube-scheduler-k8s-ctr            1/1     Running   1 (80s ago)   2m27s   192.168.10.100   k8s-ctr   <none>           <none>
```

실습 환경이 완전히 준비되었으며, Cilium CNI 설치를 위한 기반이 마련되었다.

## Cilium CNI 설치

### 1. 기존 CNI 제거

#### 1.1 Flannel CNI 제거
```bash
# Helm으로 설치된 Flannel 제거
helm uninstall -n kube-flannel flannel
kubectl delete ns kube-flannel

# 각 노드에서 네트워크 인터페이스 제거
ip link del flannel.1
ip link del cni0
```

#### 1.2 kube-proxy 제거
```bash
# kube-proxy DaemonSet 제거
kubectl -n kube-system delete ds kube-proxy
kubectl -n kube-system delete cm kube-proxy

# 각 노드에서 iptables 규칙 정리
iptables-save | grep -v KUBE | grep -v FLANNEL | iptables-restore
```

### 2. Cilium 설치

#### 2.1 Helm Chart로 설치
```bash
# Helm repo 추가
helm repo add cilium https://helm.cilium.io/
helm repo update

# Cilium 설치 (kube-proxy 대체 모드)
helm install cilium cilium/cilium \
  --namespace kube-system \
  --set kubeProxyReplacement=true \
  --set ipam.mode=kubernetes \
  --set routingMode=native \
  --set ipv4NativeRoutingCIDR=192.168.10.0/24 \
  --set enableIPv4Masquerade=true
```

#### 2.2 주요 설정 옵션
```yaml
# values.yaml 주요 설정
kubeProxyReplacement: true     # kube-proxy 완전 대체
ipam:
  mode: kubernetes             # Kubernetes Host Scope IPAM
routingMode: native           # 네이티브 라우팅 모드
enableIPv4Masquerade: true    # IPv4 마스커레이드 활성화
bpf:
  masquerade: true            # eBPF 마스커레이드
  hostLegacyRouting: false    # 레거시 라우팅 비활성화
```

## 설치 확인 및 테스트

### 1. 상태 확인
```bash
# 노드 상태 확인
kubectl get nodes -owide

# Pod 상태 확인
kubectl get pods -n kube-system -l k8s-app=cilium

# Cilium 엔드포인트 확인
kubectl get ciliumendpoints
```

### 2. 네트워크 연결성 테스트
```bash
# Cilium 연결성 테스트
cilium connectivity test

# 기본 네트워크 확인
cilium node list
cilium endpoint list
```

### 3. 샘플 애플리케이션 테스트

#### 3.1 테스트 애플리케이션 배포
```yaml
# webpod 애플리케이션
apiVersion: apps/v1
kind: Deployment
metadata:
  name: webpod
spec:
  replicas: 2
  selector:
    matchLabels:
      app: webpod
  template:
    metadata:
      labels:
        app: webpod
    spec:
      affinity:
        podAntiAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
          - labelSelector:
              matchExpressions:
              - key: app
                operator: In
                values:
                - webpod
            topologyKey: "kubernetes.io/hostname"
      containers:
      - name: webpod
        image: traefik/whoami
        ports:
        - containerPort: 80
---
apiVersion: v1
kind: Service
metadata:
  name: webpod
spec:
  selector:
    app: webpod
  ports:
  - protocol: TCP
    port: 80
    targetPort: 80
  type: ClusterIP
```

#### 3.2 통신 테스트
```bash
# 테스트 Pod 생성
kubectl run curl-pod --image=nicolaka/netshoot --command -- tail -f /dev/null

# Pod 간 통신 테스트
kubectl exec -it curl-pod -- curl webpod

# Service 로드밸런싱 테스트
kubectl exec -it curl-pod -- sh -c 'while true; do curl -s webpod | grep Hostname; sleep 1; done'
```

## Cilium의 핵심 장점

| 분류 | 항목 | 설명 |
|------|------|------|
| 성능 | eBPF 기반 | 커널 레벨에서 패킷 처리 |
| 성능 | O(1) 복잡도 | 해시맵 기반 빠른 룩업 |
| 성능 | Zero-copy | 불필요한 메모리 복사 최소화 |
| 확장성 | 대규모 클러스터 지원 | 수천 개 노드까지 확장 |
| 확장성 | 효율적인 정책 관리 | 복잡한 네트워크 정책 지원 |
| 확장성 | Multi-cluster | Cluster Mesh로 클러스터 간 연결 |
| 가시성 | Hubble | 네트워크 플로우 관찰 도구 |
| 가시성 | 실시간 모니터링 | L3/L4/L7 트래픽 분석 |
| 가시성 | 보안 정책 시각화 | 네트워크 정책 적용 상태 확인 |
| 보안 | 세밀한 정책 제어 | L7 레벨까지 정책 적용 |
| 보안 | 암호화 | WireGuard/IPSec 지원 |
| 보안 | 제로 트러스트 | 기본적으로 모든 트래픽 제어 |

## 추가 학습 리소스 {: .no-toc }

### 1. 공식 문서

- [Cilium 공식 문서](https://docs.cilium.io/)
- [eBPF 공식 사이트](https://ebpf.io/)

### 2. 실습 과제

1. Multi-cluster 환경 구성해보기
2. Hubble UI로 네트워크 플로우 분석하기
3. L7 네트워크 정책 적용해보기
4. WireGuard 암호화 설정하기

### 3. 트러블슈팅

- `cilium connectivity test`로 문제 진단
- `cilium status --verbose`로 상세 상태 확인
- `/var/log/cilium/` 로그 분석
- `kubectl describe pod -n kube-system <cilium-pod>`로 이벤트 확인
