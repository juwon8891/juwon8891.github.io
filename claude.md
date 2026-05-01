# Claude 작업 기록

## 작성 지침

**블로그 포스트 작성 시 주의사항**:
- ❌ **"다음 주차 Preview" 섹션 작성 금지**: 향후 계획이나 예정 내용 언급하지 않음
- ❌ **"Week X Preview" 섹션 작성 금지**: 미래 주차 내용 미리보기 금지
- ✅ **현재 주차 내용에만 집중**: 해당 주차에서 학습한 내용만 정리
- ✅ **"마무리" 섹션**: 핵심 요약만 포함, 다음 주차 언급 없이 종료

## 2026-04-24 작업 내역

### 1. PDF 분석 및 정리 (EKS Week 6)
- 파일: `(2) 6주차 - CI_CD with Amazon EKS _ Notion.pdf`
- PDF 전체 68페이지 분석 완료
- EKS CI/CD with GitOps 실습 가이드 내용 정리

### 2. EKS Week 6 학습정리 파일 생성 및 확장
- 파일명: `_posts/2026-04-15-eks-week6-cicd.md`
- 초기 생성: 557줄 (개요 + Mermaid 다이어그램 7개)
- 최종 확장: 1,450줄 (실습 섹션 상세 추가)
- GitOps 기반 CI/CD 파이프라인 및 Platform Engineering 내용을 체계적으로 마크다운 문서로 변환

### 3. Mermaid 다이어그램 추가 (EKS Week 6)
학습정리 파일에 주요 개념을 시각화한 Mermaid 다이어그램 7개 추가:
1. **GitOps 4대 원칙** - Declarative, Versioned and Immutable, Pulled Automatically, Continuously Reconciled
2. **Platform Engineering과 DevOps 진화** - DevOps → GitOps → Platform Engineering (3대 가치: 속도, 거버넌스, 효율성)
3. **EKS GitOps 전체 아키텍처** - Flux v2, Tofu 컨트롤러, Helm 컨트롤러, Argo Workflows 통합 구조
4. **SaaS 티어 모델 (Silo, Hybrid, Pool)** - Premium (Silo), Advanced (Hybrid), Basic (Pool) 배포 전략
5. **Flux v2 Reconciliation 흐름** - GitRepository → HelmRepository → HelmRelease → Kubernetes 리소스 배포
6. **Tofu 컨트롤러 + Terraform 실행 흐름** - Git Push → Flux → Terraform CRD → tf-runner Pod → AWS 리소스 프로비저닝
7. **Argo Workflows 온보딩 워크플로우** - SQS 메시지 → Argo Events → Workflow → Git Push → Flux → 배포

### 4. 실습 섹션 상세 추가 (557줄 → 1,450줄)
실습 1부터 4까지 상세 내용 추가:

**실습 1: GitOps로 구현하는 SaaS 플랫폼 엔지니어링**
- 1.1 시작하기: EKS 클러스터 준비, Namespace 확인, Flux v2 리소스 확인, Gitea Git 저장소 구성
- 1.2 Terraform 및 OpenTofu 컨트롤러: Terraform 모듈 구조 (main.tf, variables.tf, outputs.tf), Terraform CRD 생성, tf-runner Pod 실행, Terraform State 저장 (Kubernetes Secret)
- 1.3 Helm 차트: helm-tenant-chart 디렉터리 구조, Chart.yaml/values.yaml 상세, ECR에 Helm 차트 업로드 (OCI 형식)
- 1.4 Helm 차트의 Flux 통합: HelmRepository 생성, HelmRelease 생성 (Premium Tier 예시), Git Push 및 Flux Reconciliation, 배포된 리소스 확인, kustomization.yaml 활용

**실습 2: SaaS 티어 전략**
- 티어별 HelmRelease 생성 (Basic/Advanced/Premium)
- 티어별 배포 확인 (enable_producer/enable_consumer 옵션)

**실습 3: 자동화된 테넌트 온보딩/오프보딩**
- 온보딩 실행 (SQS 메시지 전송, Argo Workflow 확인, Gitea HelmRelease 커밋 확인)
- 오프보딩 실행 (SQS 메시지 전송, HelmRelease 삭제 커밋 확인)
- 전체 자동화 흐름 요약표 (5개 구성 요소)

**실습 4: 리소스 확인 및 테스트**
- 배포 검증 (Deployment 확인)
- 환경 변수 확인 (티어별 차이)
- DynamoDB/SQS 데이터 확인

**참고 자료**
- Argo Image Updater 패턴 설명
- Argo CD App-of-apps 패턴 설명
- 주요 도구 및 참고 링크

## 2026-04-19 작업 내역

### 1. EKS Week 5 학습정리 파일 생성 (실무 트러블슈팅)
- 파일명: `_posts/2026-04-08-eks-week5-pod-readiness-gates.md`
- **롤링 업데이트 502 에러 - Pod Readiness Gates를 통한 근본 해결**
- EKS와 GKE 환경 비교 분석

### 2. 문제 및 해결
- **문제**: Kubernetes와 Cloud LoadBalancer 라이프사이클 불일치 → 28~40초간 502 에러 발생
- **근본 원인**: Kubernetes readinessProbe 성공 vs LoadBalancer Health Check 완료 시간 차이
- **해결**: Pod Readiness Gates로 두 시스템 동기화

### 3. EKS vs GKE 비교 분석
- **EKS (AWS Load Balancer Controller)**:
  - 활성화: `kubectl label namespace production elbv2.k8s.aws/pod-readiness-gate-inject=enabled`
  - conditionType: `target-health.alb.ingress.k8s.aws/<TGB>`
  - 설정 복잡도: 매우 낮음 (label 1줄)
  - 종료 타이밍: preStop 15초 권장

- **GKE (NEG - Network Endpoint Group)**:
  - 활성화: **Container-native load balancing (NEG) 사용 시 자동 활성화** (별도 annotation 불필요)
  - Service에 `cloud.google.com/neg: '{"ingress": true}'` 추가로 NEG 활성화
  - GKE 1.17+ 버전에서는 Ingress 생성 시 자동으로 NEG 사용
  - conditionType: `cloud.google.com/load-balancer-neg-ready` (자동 주입)
  - 설정 복잡도: 낮음 (Ingress 생성 시 자동)
  - 종료 타이밍: preStop 120초 권장 (Drain Latency 고려)
  - Drain Latency: NEG API에서 endpoint 분리하는 데 5~15초 추가 소요
  - 시나리오별 이미지 추가 (senario1.png, senario2.png, senario3.png):
    - 시나리오 1: drainingTimeoutSec 미설정 → 502/503 에러 (5~10초)
    - 시나리오 2: drainingTimeoutSec 설정 → 에러 감소 (2~5초)
    - 시나리오 3: preStop Hook 추가 → 에러 완전 제거 (0%)

### 4. 주요 내용
- **라이프사이클 불일치 분석**: 표와 타임라인으로 정확한 시점 비교
- **Pod Readiness Gates 개념**: Kubernetes Ready 조건에 외부 시스템 상태 추가
- **AWS Load Balancer Controller 동작 원리**:
  - Pod Mutator: Mutating Webhook을 통한 readinessGates 자동 주입 (주입 조건 3가지)
  - Target Health Reconciler: 15초마다 ALB Target Health 조회 및 Pod Condition 업데이트
  - 소스 코드 핵심 로직 축약 및 설명 추가
- **기존 해결책 비교 (minReadySeconds vs Pod Readiness Gates)**:
  - minReadySeconds: 고정 시간 대기 (30초), 추측 기반, 수동 계산
  - Pod Readiness Gates: 동적 대기 (ALB 상태 기반), 실시간 확인, 자동 동기화
  - 비교표: 대기 방식, 정확성, 설정 복잡도, 유지보수, 배포 시간
- **GKE BackendConfig 설정**:
  - connectionDraining.drainingTimeoutSec: 60초
  - preStop Hook: 120초 (Backend Drain + Drain Latency)
  - terminationGracePeriodSeconds: 210초
- **플랫폼별 비교표**: 활성화 방법, 컨트롤러, 설정 복잡도, 타이밍 등 9가지 항목 비교
- **Deployment/Ingress 구성 요소 설명** (코드 축약, 설명 강화):
  - maxUnavailable: 0 필수 이유
  - readinessProbe vs ALB Health Check 차이
  - preStop Hook과 Deregistration Delay 타이밍
  - interval × threshold = Ready 전환 시간
- **타임라인 비교**: 텍스트 형식 → 표 형식으로 변경 (Before/After 시간순 비교)
- **검증 방법**: Pod Condition 확인, ALB Target Health (curl 테스트 삭제)
- **메트릭**: Before (100% 에러) → After (0% 에러)

### 5. Mermaid 다이어그램 (EKS Week 5)
- **Pod Readiness Gates 동작 원리** - Kubernetes → Pod → LB Controller → Cloud LoadBalancer 시퀀스

### 6. 문서 포맷 변경
- 이전: 스토리텔링 방식 ("새벽 3시 슬랙 메시지", "지옥/천국")
- 현재: 기술적/분석적 방식 (비교표, 타임라인, 근본 원인 분석)
- 감정적 표현 최소화, 객관적 메트릭 중심
- **코드 축약 + 설명 강화**:
  - 긴 YAML/Go 코드 → 핵심 로직만 남김
  - 각 설정의 "왜?", "어떻게?", "무엇을?" 상세 설명 추가
  - 예: Deployment YAML 55줄 → 핵심 3가지 요소 설명으로 축약
  - 예: Go 코드 40줄 → 핵심 로직 + 동작 원리 설명으로 축약
## 2026-04-13 작업 내역

### 1. PDF 분석 및 정리 (EKS Week 4)
- 파일: `(2) 4주차 - EKS AuthN_AuthZ _ Notion.pdf`
- PDF 내용 추출 및 분석 완료 (47 페이지)
- EKS Authentication & Authorization 실습 가이드 내용 정리

### 2. EKS Week 4 학습정리 파일 생성
- 파일명: `_posts/2026-04-01-eks-week4-authn-authz.md`
- EKS 인증/인가 내용을 체계적으로 마크다운 문서로 변환
- 주요 개념 7가지 Mermaid 다이어그램 포함

### 3. Mermaid 다이어그램 추가 (EKS Week 4)
학습정리 파일에 주요 개념을 시각화한 Mermaid 다이어그램 추가:
1. **K8S API 접근 제어 흐름** - Authentication → Authorization → Admission Control → etcd
2. **IRSA 전체 흐름** - Pod Identity Webhook → STS → OIDC Provider → AWS IAM → S3
3. **EKS kubectl 인증 흐름** - aws-iam-authenticator → STS → API Server → Webhook → aws-auth ConfigMap
4. **Namespace별 ServiceAccount 분리** - dev-team, infra-team RBAC 설정
5. **Bearer Token (JWT) 동작 원리** - Token Verification → Public Key → Payload 디코딩 → RBAC
6. **OIDC Authorization Code Flow** - User → App → Keycloak → Token Exchange
7. **OAuth 2.0 vs OIDC vs IRSA 비교** - 인가 vs 인증 vs Pod→AWS 인증

## 2026-04-01 작업 내역

### 1. PDF 분석 및 정리 (EKS Week 3)
- 파일: `(2) 3주차 - EKS Scaling _ Notion.pdf`
- PDF 내용 추출 및 분석 완료 (76 페이지)
- EKS Auto Scaling 실습 가이드 내용 정리

### 2. EKS Week 3 학습정리 파일 생성
- 파일명: `_posts/2026-03-25-eks-week3-scaling.md`
- EKS Auto Scaling 내용을 체계적으로 마크다운 문서로 변환
- 주요 개념 7가지 Mermaid 다이어그램 포함

### 3. Mermaid 다이어그램 추가 (EKS Week 3)
학습정리 파일에 주요 개념을 시각화한 Mermaid 다이어그램 추가:
1. **HPA 동작 흐름** - Metrics Server → HPA Controller → ReplicaSet 조정
2. **KEDA 아키텍처** - External Event Source → KEDA Scaler → HPA 생성
3. **Cluster Autoscaler vs Karpenter** - CAS (ASG 기반, 느림) vs Karpenter (EC2 직접, 빠름)
4. **Karpenter Provisioning 워크플로우** - Pending Pod → NodePool → EC2 생성 → Pod 바인딩
5. **Karpenter Disruption 메커니즘** - Consolidation, Drift, Expiration, Interruption
6. **VPA 컴포넌트 상호작용** - Recommender → Updater → Admission Controller
7. **EKS Auto Scaling 전체 구조** - Pod/노드/서버리스 계층 구조

## 2026-02-21 작업 내역 (Week 7)

### 1. PDF 분석 및 정리 (Week 7)
- 파일: `(1) RKE2 & Cluster API _ Notion.pdf`
- PDF 내용 추출 및 분석 완료 (50 페이지)
- RKE2 & Cluster API 실습 가이드 내용 정리

### 2. K8s-Deploy Week 7 학습정리 파일 생성
- 파일명: `_posts/2026-02-21-k8s-deploy-week7-rke2-cluster-api.md`
- RKE2와 Cluster API 내용을 체계적으로 마크다운 문서로 변환
- 주요 개념 7가지 Mermaid 다이어그램 포함

### 3. Mermaid 다이어그램 추가 (Week 7)
학습정리 파일에 주요 개념을 시각화한 Mermaid 다이어그램 추가:
1. **RKE2 Server 노드 아키텍처** - systemd, Static Pods, Containerd 구조
2. **RKE2 Agent 노드 아키텍처** - Containerd, Kubelet, Workloads 구조
3. **RKE2 HA 구성** - Load Balancer, Embedded etcd, Raft 구조
4. **Cluster API 아키텍처** - Management Cluster, Provider, Infrastructure 관계
5. **업그레이드 흐름** - Server → Agent 순차 업그레이드
6. **RKE2 보안 강화** - FIPS 140-2 준수 흐름
7. **CAPI 멀티 클라우드** - 동일 YAML로 다양한 클라우드 지원

## 2026-02-15 작업 내역

### 1. PDF 분석 및 정리 (Week 6)
- 파일: `(1) Kubespray offline 설치 _ Notion.pdf`
- PDF 내용 추출 및 분석 완료 (3,234 라인)
- Kubespray 폐쇄망(Air-Gap) 환경 offline 설치 실습 가이드 내용 정리

### 2. K8s-Deploy Week 6 학습정리 파일 생성
- 파일명: `_posts/2026-02-15-k8s-deploy-week6-kubespray-offline.md`
- Kubespray Offline 설치 내용을 체계적으로 마크다운 문서로 변환
- 주요 개념 5가지 Mermaid 다이어그램 포함

### 3. Mermaid 다이어그램 추가 (Week 6)
학습정리 파일에 주요 개념을 시각화한 Mermaid 다이어그램 추가:
1. **폐쇄망 환경 아키텍처** - Internet → DMZ → 내부망 (Air-Gap) 구조
2. **NTP 동기화 흐름** - Internet NTP → admin → k8s-nodes
3. **NAT Gateway 동작 원리** - SNAT/DNAT 흐름
4. **Registry 이미지 해석 흐름** - FQDN 체크 → shortnames.conf → unqualified-search-registries
5. **kubespray-offline 전체 흐름** - Download → Setup → Deploy 단계
6. **이미지 Registry push 흐름** - Tag → Push → Storage
7. **Offline 배포 핵심 구성요소** - Nginx, Registry, YUM Repo, PyPI Mirror

## 2026-02-04 작업 내역

### 1. PDF 분석 및 정리 (Week 5)
- 파일: `(1) Kubespary HA & Upgrade.pdf`
- PDF 내용 추출 및 분석 완료 (Task 도구 사용)
- Kubespray HA 구성 및 노드 관리 실습 가이드 내용 정리

### 2. K8s-Deploy Week 5 학습정리 파일 생성
- 파일명: `_posts/2026-02-04-k8s-deploy-week5-kubespray-ha-upgrade.md`
- Kubespray HA & Upgrade 내용을 체계적으로 마크다운 문서로 변환
- 주요 개념 8가지 Mermaid 다이어그램 포함

### 3. Mermaid 다이어그램 추가 (Week 5)
학습정리 파일에 주요 개념을 시각화한 Mermaid 다이어그램 추가:
1. **Client-Side LoadBalancing 구조** - Nginx Static Pod를 통한 HA 구성
2. **External LB + Client-Side LB 구조** - HAProxy와 Nginx의 이중 장애 보호
3. **External LB Only 구조** - 모든 노드가 HAProxy 사용
4. **scale.yml 실행 흐름** - 노드 추가 프로세스
5. **remove-node.yml 실행 흐름** - 노드 제거 프로세스 (PDB 고려)
6. **Client-Side LoadBalancing 동작 원리** - kubelet → Nginx → API Server 흐름
7. **HAProxy LoadBalancing 구조** - Frontend, Backend, 통계 페이지
8. **Kubespray 변수 우선순위** - 6단계 Override Flow

## 2026-01-28 작업 내역

### 1. PDF 분석 및 정리 (Week 4)
- 파일: `(2) Kubespary 배포 분석.pdf`
- PDF 내용 추출 및 분석 완료 (5,053 라인)
- Kubespray 배포 및 내부 동작 분석 실습 가이드 내용 정리

### 2. K8s-Deploy Week 4 학습정리 파일 생성
- 파일명: `_posts/2026-01-28-k8s-deploy-week4-kubespray-deployment.md`
- Kubespray 배포 분석 내용을 체계적으로 마크다운 문서로 변환
- 주요 개념 7가지 Mermaid 다이어그램 포함

### 3. Mermaid 다이어그램 추가 (Week 4)
학습정리 파일에 주요 개념을 시각화한 Mermaid 다이어그램 추가:
1. **Kubespray 전체 실행 흐름** - 사전 검증부터 애드온 설치까지 15개 PLAY
2. **디렉터리 구조** - playbooks, roles, inventory 구조
3. **Role 의존성** - Role 간 의존성 및 실행 순서
4. **Container Engine 설치 과정** - Containerd, Runc, CNI Plugins 설치 흐름
5. **etcd 설치 및 구성** - 인증서 생성부터 systemd unit 설정까지
6. **Containerd Registry 미러 설정** - certs.d 기반 Registry 미러 메커니즘
7. **변수 우선순위** - Ansible 변수 우선순위 체계

## 2026-01-24 작업 내역

### 1. PDF 분석 및 정리 (Week 3)
- 파일: `(2) Kubeadm & K8S Upgrade.pdf`
- PDF 내용 추출 및 분석 완료 (Task 도구 사용)
- Kubeadm 클러스터 구축 및 업그레이드 실습 가이드 내용 정리

### 2. K8s-Deploy Week 3 학습정리 파일 생성
- 파일명: `_posts/2026-01-24-k8s-deploy-week3-kubeadm-upgrade.md`
- Kubeadm 및 K8s 업그레이드 내용을 체계적으로 마크다운 문서로 변환
- 주요 개념 7가지 Mermaid 다이어그램 포함

### 3. Mermaid 다이어그램 추가 (Week 3)
학습정리 파일에 주요 개념을 시각화한 Mermaid 다이어그램 추가:
1. **kubeadm init 실행 흐름** - Preflight부터 애드온 설치까지 전체 과정
2. **kubeadm join 실행 흐름** - Discovery부터 노드 등록까지
3. **인증서 체인 구조** - CA별 인증서 계층 구조
4. **K8s 업그레이드 전략 비교** - In-Place vs Blue-Green
5. **업그레이드 흐름도** - Control Plane → Worker 노드 순차 업그레이드
6. **OverlayFS 레이어 구조** - Lower/Upper/Merged Layer
7. **Version Skew Policy** - 컴포넌트별 버전 호환성

## 2026-01-17 작업 내역

### 1. PDF 분석 및 정리 (Week 1)
- 파일: `(3) Bootstrap Kubernetes the hard way.pdf`
- PDF 내용 추출 및 분석 완료 (2,257 라인)
- Kubernetes The Hard Way 실습 가이드 내용 정리

### 2. K8s-Deploy Week 1 학습정리 파일 생성
- 파일명: `_posts/2026-01-10-k8s-deploy-week1-kubernetes-hard-way.md` (날짜: 2026-01-10)
- 새로운 스터디 시리즈 "[K8s-Deploy]" 시작
- PDF 내용을 체계적으로 마크다운 문서로 변환

### 3. 파일 수정
- "전체 커리큘럼 (예정)" 섹션 제거
- "Week 2 Preview" 섹션 제거
- 현재 주차 내용에 집중하도록 구성 변경

### 4. .gitignore 파일 생성
- `.DS_Store` 및 macOS 관련 파일 무시 설정
- Jekyll, Ruby, Bundler 관련 파일 무시 설정

### 5. Mermaid 다이어그램 추가 (Week 1)
학습정리 파일에 주요 개념을 시각화한 Mermaid 다이어그램 추가:
1. **실습 아키텍처** - Control Plane과 Worker Node 구조
2. **인증서 체인 구조** - Root CA에서 각 컴포넌트 인증서까지의 관계
3. **인증/인가 흐름** - kubelet의 API 요청 시 Authentication → Authorization 흐름
4. **API Server → Kubelet 통신** - kubectl logs 실행 시 전체 흐름
5. **Pod 생성 흐름** - Deployment 생성부터 Pod 실행까지의 전체 과정
6. **Certificate → RBAC 매핑** - 인증서 Subject가 Kubernetes RBAC으로 매핑되는 과정

### 6. PDF 분석 및 정리 (Week 2)
- 파일: `(2) Ansible 기초.pdf`
- PDF 내용 추출 및 분석 완료 (2,354 라인)
- Ansible 기초 실습 가이드 내용 정리

### 7. K8s-Deploy Week 2 학습정리 파일 생성
- 파일명: `_posts/2026-01-17-k8s-deploy-week2-ansible-basics.md`
- Ansible 기초 내용을 체계적으로 마크다운 문서로 변환
- 주요 개념 5가지 Mermaid 다이어그램 포함

### 8. Mermaid 다이어그램 추가 (Week 2)
학습정리 파일에 주요 개념을 시각화한 Mermaid 다이어그램 추가:
1. **Ansible 아키텍처** - Control Node와 Managed Node 구조
2. **Control vs Managed Node** - 컴포넌트별 상세 구조
3. **Playbook 실행 흐름** - SSH 연결부터 Handler 실행까지 전체 과정
4. **Handler 동작 원리** - Task 변경 시 Handler notify 메커니즘
5. **Block 에러 처리** - Block, Rescue, Always 흐름
6. **변수 우선순위** - Extra vars부터 Role defaults까지 우선순위 체계
7. **롤 실행 순서** - Pre-tasks, Roles, Tasks, Post-tasks, Handlers 순서

---

## 2026-04-29 작업 내역

### 1. PDF 분석 및 정리 (EKS Week 7)
- 파일: `(2) 7주차 워크숍 실습 메모(gasida) _ Notion.pdf`
- PDF 전체 27페이지 분석 완료
- EKS Cluster In-place Upgrades (1.30 → 1.31) 실습 가이드 내용 정리

### 2. EKS Week 7 학습정리 파일 생성
- 파일명: `_posts/2026-04-29-eks-week7-cluster-upgrade.md`
- EKS 클러스터 업그레이드 내용을 체계적으로 마크다운 문서로 변환
- 주요 개념 7가지 Mermaid 다이어그램 포함

### 3. Mermaid 다이어그램 추가 (EKS Week 7)
학습정리 파일에 주요 개념을 시각화한 Mermaid 다이어그램 7개 추가:
1. **업그레이드 준비 흐름** - Upgrade Insights → 백업 → Add-on 호환성 → Deprecated API → HA 전략 → 업그레이드 시작
2. **In-place Cluster Upgrades 전체 흐름** - Control Plane (10분) → Add-on (2분) → Nodes (30분) 순차 업그레이드
3. **Sample Application 아키텍처** - UI → Orders/Checkout/Carts/Catalog/Assets → MySQL/Redis/DynamoDB/RabbitMQ
4. **ArgoCD GitOps 배포 구조** - Git Repository (CodeCommit) → ArgoCD → EKS Cluster → app-of-apps
5. **관리형 노드그룹 In-Place 업그레이드** - 기존 노드 → 사용자 지정 AMI → 업그레이드 (1.30 → 1.31)
6. **관리형 노드그룹 Blue-Green 업그레이드** - blue-mng (1.30) → green-mng (1.31) → app 마이그레이션 → blue-mng 삭제
7. **EKS 업그레이드 전체 흐름** - Insights → 백업 → Control Plane → Add-on → Nodes (관리형/카펜터/셀프/파게이트) → 검증

### 4. 주요 실습 내용

**실습 환경**:
- EKS 클러스터 버전: 1.30 → 1.31
- 리전: us-west-2
- 노드 OS: Amazon Linux 2023, 커널 6.1, containerd 2.2.1
- 노드 타입: 관리형(blue-mng, initial), 셀프(default-selfmng), 파게이트(fp-profile), 카펜터(default-spot)

**Preparing for Cluster Upgrades**:
- kube-ops-view 또는 ui-web을 통한 실시간 모니터링
- 노드그룹별 업그레이드 전략 수립
- 다양한 방법 비교: eksctl, AWS 콘솔, AWS CLI, Terraform

**In-place Cluster Upgrades (1.30 → 1.31)**:
1. **Control Plane 업그레이드** (10분 소요)
   - 방법 1: eksctl (이래 실행하지 않음)
   - 방법 2: AWS 관리 콘솔 (skip, 이래 실행하지 않음)
   - 방법 3: AWS CLI (이래 실행하지 않음)
   - **방법 4: Terraform (권장, 실제 실행!)**
2. **Add-on 업그레이드** (2분 소요)
   - CoreDNS
   - kube-proxy
   - VPC CNI
   - EBS CSI Driver
3. **Nodes 업그레이드**
   - **관리형 노드그룹** (30분 소요):
     - In-Place Managed Node group Upgrade
     - Blue-Green approach for Managed node group update
   - **카펜터 노드**: 자동 교체 (1.31 AMI 사용)
   - **셀프 노드그룹**: ASG Launch Template 업데이트
   - **파게이트 프로파일**: Pod 재시작

**HA 전략 (High Availability Strategies)**:
- **PodDisruptionBudgets (PDB)**: orders 애플리케이션에 PDB 설정 (minAvailable: 1)
- **TopologySpreadConstraints**: Pod를 여러 가용 영역(AZ)에 분산 배치

**EKS Upgrade Insights**:
- 6가지 점검 항목:
  1. kube-proxy version skew
  2. Cluster health issues
  3. EKS add-ons compatibility
  4. Amazon Linux expiration (2025년 11월 26일 지원 종료)
  5. kubelet version skew
  6. Deprecated APIs (v1.32에서 제거 예정)

**Sample Application (ArgoCD GitOps)**:
- UI → Orders, Checkout, Carts, Catalog, Assets
- Persistence: MySQL, Redis, DynamoDB
- Messaging: RabbitMQ
- ArgoCD를 사용한 GitOps 배포 (AWS CodeCommit 저장소)

### 5. 핵심 개념

**EKS 업그레이드 순서**:
- Upgrade Insights 사전 점검 → 백업 → Control Plane → Add-on → Nodes → 검증

**업그레이드 Best Practices**:
1. Upgrade Insights 사전 점검 (kube-proxy, Add-on, Deprecated API 등)
2. 백업 생성 (etcd 스냅샷, PV 스냅샷)
3. PDB 설정 (minAvailable로 가용성 보장)
4. TopologySpreadConstraints 적용 (AZ 분산 배치)
5. 모니터링 도구 활성화 (kube-ops-view, CloudWatch)
6. 순차 업그레이드 (Control Plane → Add-on → Nodes)
7. 한 버전씩 업그레이드 (1.30 → 1.31, 두 버전 점프 불가)
8. 업그레이드 후 검증 (Pod 상태, 애플리케이션 헬스 체크)
9. Terraform 사용 권장 (IaC로 재현 가능한 업그레이드)

**주의사항**:
- ⚠️ 업그레이드는 되돌릴 수 없음 (Rollback 불가)
- ⚠️ Deprecated API 사전 확인 필수 (v1.32에서 제거되는 API)
- ⚠️ Amazon Linux 노드는 2025년 11월 26일 지원 종료 (AL2023으로 마이그레이션)

**In-Place vs Blue-Green**:
- **In-Place**: 기존 노드 교체 (한 번에 1개씩), PDB로 다운타임 최소화, 리소스 비용 낮음, 롤백 어려움
- **Blue-Green**: 새 노드그룹 생성 후 마이그레이션, 다운타임 없음, 리소스 비용 2배 (일시적), 롤백 쉬움

---

**최종 업데이트**: 2026-04-29
