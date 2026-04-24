---
layout: post
title: "[EKS] Week 6: CI/CD with Amazon EKS - GitOps & Platform Engineering"
date: 2026-04-15 09:00:00 +0900
categories: [Kubernetes, EKS]
tags: [EKS, GitOps, FluxCD, ArgoCD, Argo Workflows, Terraform, Helm, Platform Engineering, SaaS, Multi-Tenancy]
---

## 개요

Amazon EKS 환경에서 **GitOps 기반 CI/CD 파이프라인**을 구축하고, **Platform Engineering** 개념을 활용하여 **Multi-Tenant SaaS 플랫폼**을 구현하는 방법을 학습합니다.

이번 실습에서는 다음 도구들을 사용합니다:
- **Flux v2**: Git 저장소 변경 사항을 Kubernetes 클러스터에 자동 동기화
- **Argo Workflows**: 테넌트 온보딩/오프보딩 자동화
- **Tofu 컨트롤러**: Terraform을 GitOps 방식으로 실행
- **Helm 차트**: Kubernetes 애플리케이션 패키징 및 배포

---

## GitOps란?

### GitOps 4대 원칙

```mermaid
graph TD
    A[GitOps Principles] --> B[1. Declarative 선언적]
    A --> C[2. Versioned and Immutable 버전 관리 및 불변성]
    A --> D[3. Pulled Automatically 자동 Pull]
    A --> E[4. Continuously Reconciled 지속적 조정]
    
    B --> B1["Git = Single Source of Truth<br/>YAML로 원하는 상태 선언"]
    C --> C1["Git 커밋 = 버전 히스토리<br/>Rollback 가능"]
    D --> D1["Software Agent가 Git 변경 감지<br/>자동으로 클러스터에 적용"]
    E --> E1["Actual State → Desired State<br/>Drift 발생 시 자동 복구"]
    
    style A fill:#f9f,stroke:#333,stroke-width:4px
    style B fill:#bbf,stroke:#333
    style C fill:#bbf,stroke:#333
    style D fill:#bbf,stroke:#333
    style E fill:#bbf,stroke:#333
```

**핵심**:
- **Declarative (선언적)**: 시스템의 원하는 상태(Desired State)를 선언적으로 정의
- **Versioned and Immutable (버전 관리 및 불변성)**: Git에 저장되어 버전 히스토리 유지, Rollback 가능
- **Pulled Automatically (자동 Pull)**: Software Agent가 Git 저장소를 주기적으로 감시하여 변경 사항 자동 반영
- **Continuously Reconciled (지속적 조정)**: 실제 상태(Actual State)와 원하는 상태(Desired State)의 차이(Drift)를 지속적으로 감지하고 조정

---

### Platform Engineering과 DevOps 진화

```mermaid
graph LR
    A[DevOps<br/>2009~] --> B[GitOps<br/>2017~]
    B --> C[Platform Engineering<br/>2020~]
    
    A --> A1["개발팀과 운영팀 협업<br/>자동화 + 문화 변화"]
    B --> B1["Git = 진실의 단일 소스<br/>선언적 인프라 관리"]
    C --> C1["IDP 구축<br/>셀프서비스 플랫폼"]
    
    C --> D[3대 가치]
    D --> D1[Velocity<br/>속도]
    D --> D2[Governance<br/>거버넌스]
    D --> D3[Efficiency<br/>효율성]
    
    style C fill:#f96,stroke:#333,stroke-width:3px
    style D fill:#9cf,stroke:#333,stroke-width:2px
```

**Platform Engineering 3대 가치**:
1. **Velocity (속도)**: 빠른 서비스 배포 기능 제공
2. **Governance (거버넌스)**: 정의, 인정, 확정 등의 요구 사항을 플랫폼 차원에서 자동화
3. **Efficiency (효율성)**: 반복 대신 구성을 통해 인프라 비용을 절감하고, 인적 자원의 전문성을 더 섬세하게 활용

---

### EKS GitOps 전체 아키텍처

```mermaid
graph TB
    subgraph "Git Repository"
        GR[Gitea<br/>GitOps Repository]
        HR[Helm Charts<br/>Application Templates]
    end
    
    subgraph "Amazon EKS Cluster"
        subgraph "GitOps Controllers"
            FC[Flux v2<br/>GitRepository Reconciler]
            TC[Tofu Controller<br/>Terraform CRD]
            HC[Helm Controller<br/>HelmRelease]
        end
        
        subgraph "Argo Workflows"
            AW[Argo Workflows<br/>Tenant Onboarding/Offboarding]
        end
        
        subgraph "Tenants"
            T1[Tenant-1<br/>Premium Tier]
            T2[Tenant-2<br/>Basic Tier]
            T3[Tenant-3<br/>Advanced Tier]
        end
    end
    
    subgraph "AWS Resources"
        ECR[Amazon ECR<br/>Helm Chart Images]
        SQS[Amazon SQS]
        DDB[Amazon DynamoDB]
        S3[Amazon S3]
    end
    
    GR -->|Watch| FC
    HR -->|Pull| HC
    FC -->|Create| TC
    FC -->|Create| HC
    TC -->|Provision| SQS
    TC -->|Provision| DDB
    HC -->|Deploy| T1
    HC -->|Deploy| T2
    HC -->|Deploy| T3
    ECR -.->|Pull Images| HC
    
    AW -->|Trigger| GR
    
    style FC fill:#4495d1,color:#fff
    style TC fill:#7B42BC,color:#fff
    style HC fill:#0f1689,color:#fff
    style AW fill:#f96,color:#fff
```

**핵심 구성 요소**:
- **Flux v2**: Git 저장소를 Watch하여 Kubernetes 리소스 자동 동기화
- **Tofu 컨트롤러**: Terraform 코드를 GitOps 방식으로 실행 (AWS 리소스 프로비저닝)
- **Helm 컨트롤러**: Helm 차트 기반 애플리케이션 배포
- **Argo Workflows**: 테넌트 온보딩/오프보딩 워크플로우 자동화

---

## 실습 환경 구성

### 실습 환경

| 리소스 | 사양 | 용도 |
|--------|------|------|
| **EKS Cluster** | myeks | Kubernetes 클러스터 (v1.31) |
| **Bastion EC2** | t3.medium | 관리 호스트 (kubectl, Flux CLI) |
| **Amazon ECR** | - | 애플리케이션 컨테이너 이미지 및 Helm 차트 저장소 |
| **Gitea** | GitOps Repository | Git 저장소 (Terraform, Helm Charts, Application 매니페스트) |
| **AWS Resources** | SQS, DynamoDB, IAM | 테넌트별 AWS 리소스 |

### GitOps 컨트롤러

| 컨트롤러 | 버전 | 역할 |
|---------|------|------|
| **Flux v2** | v2.x | GitRepository Watch 및 Kubernetes 리소스 자동 동기화 |
| **Tofu 컨트롤러** | v0.x | Terraform 코드를 GitOps 방식으로 실행 |
| **Helm 컨트롤러** | v1.x | Helm 차트 배포 및 HelmRelease 관리 |
| **Argo Workflows** | v3.x | 테넌트 온보딩/오프보딩 워크플로우 |

---

## 실습 1: GitOps로 구현하는 SaaS 플랫폼 엔지니어링

### 1.1 Flux v2 리소스 확인

Flux v2는 다음과 같은 CRD(Custom Resource Definition)를 제공합니다:

| Flux v2 리소스 | 역할 |
|----------------|------|
| **gitrepository** | Git 저장소 Watch (ECR 로그인 포함) |
| **helmrepository** | Helm 차트가 저장된 저장소 (ECR 포함) |
| **helmchart** | 각 소스에서 가져올 Helm 차트 |
| **helmrelease** | 실제 배포 단위, Helm 차트를 어떤 네임스페이스에 배포 가능 |
| **kustomization** | GitRepository를 기반 Kubernetes 구성 관리 |
| **imagerepository** / **imagepolicy** | 새 컨테이너 이미지 자동 감지 및 정책 적용 |
| **imageupdateautomation** | 새 이미지 감지 시 Git에 자동 커밋 (Image Automation) |

**핵심 동작**:
```bash
$ kubectl get gitrepository -n flux-system

NAME              URL                                    AGE   READY   STATUS
terraform-v0-0-1  http://admin:***@gitea:3000/admin/...  29m   True    stored artifact
```

- **flux-system** 네임스페이스에 **terraform-v0-0-1** GitRepository가 생성되어 있음
- Flux가 주기적으로 Git 저장소를 감시하며, 변경 사항 발생 시 Kubernetes 리소스 업데이트

---

### 1.2 Tofu 컨트롤러와 Terraform

```mermaid
graph LR
    subgraph "Git Repository"
        TF[Terraform 코드<br/>tenant-apps 모듈]
    end
    
    subgraph "EKS Cluster"
        FC[Flux v2<br/>GitRepository Watch]
        TC[Tofu Controller<br/>Terraform CRD]
        TR[TF-Runner<br/>Pod]
    end
    
    subgraph "AWS"
        SQS[Amazon SQS<br/>Queue]
        DDB[Amazon DynamoDB<br/>Table]
        IAM[IAM Role<br/>IRSA]
    end
    
    TF -->|Git Push| FC
    FC -->|Create| TC
    TC -->|Spawn| TR
    TR -->|Provision| SQS
    TR -->|Provision| DDB
    TR -->|Provision| IAM
    
    TC -.->|tfstate Secret| K8S[(Kubernetes Secret<br/>tfstate)]
    TR -.->|tfplan Secret| K8S
    
    style FC fill:#4495d1,color:#fff
    style TC fill:#7B42BC,color:#fff
    style TR fill:#9cf,stroke:#333
```

**Tofu 컨트롤러 동작 원리**:
1. Git 저장소에 Terraform 코드 Push (Git 커밋)
2. Flux가 변경 감지 → Tofu 컨트롤러가 **Terraform CRD** 생성
3. **tf-runner Pod**가 실행되어 Terraform 모듈 실행 (`terraform init`, `terraform plan`, `terraform apply`)
4. AWS 리소스(SQS, DynamoDB, IAM) 생성
5. Terraform State를 Kubernetes Secret에 저장 (`tfstate`, `tfplan`)

**중요**: `enable_producer`와 `enable_consumer` 옵션
- `enable_producer = false`: Producer 리소스(SQS, DynamoDB, IAM) 생성하지 않음
- `enable_consumer = false`: Consumer 리소스 생성하지 않음

---

### 1.3 Helm 차트 구조

```bash
tree /home/ec2-user/environment/gitops-gitea-repo/helm-charts/helm-charts/

helm-charts/
├── helm-tenant-chart/          # 테넌트별 애플리케이션 배포 (Producer + Consumer 통합)
│   ├── Chart.yaml
│   ├── templates/
│   │   ├── deployment.yaml
│   │   ├── service.yaml
│   │   ├── ingress.yaml
│   │   ├── hpa.yaml
│   │   └── serviceaccount.yaml
│   └── values.yaml
└── application-chart/          # Onboarding Service 동작
    ├── Chart.yaml
    └── templates/
```

**두 차트의 역할**:
- **helm-tenant-chart**: 테넌트별 배포 (Producer + Consumer 마이크로서비스)
- **application-chart**: 개발 애플리케이션을 배포 (Onboarding Service 등)

**Helm 차트 활용법**:
- `values.yaml` 파일 내 `values.yaml.template`의 필요 기본 값을 **Override**하여 설정
- 테스트 값은 **test-values.yaml** 파일을 만들고 Override 설정

---

### 1.4 Helm 차트의 Flux 통합 - HelmRelease

```mermaid
graph TB
    subgraph "Flux v2 Reconciliation Loop"
        FC[Flux Controller<br/>Watch GitRepository]
        HR[HelmRepository<br/>ECR Helm Chart URL]
        HC[HelmRelease CRD]
    end
    
    subgraph "Git Repository"
        GR[Gitea<br/>HelmRelease YAML]
    end
    
    subgraph "Amazon ECR"
        ECR[Helm Chart<br/>OCI Image]
    end
    
    subgraph "EKS Cluster"
        DEPLOY[Deployment<br/>Producer Service]
        SVC[Service]
        ING[Ingress]
    end
    
    GR -->|Git Push| FC
    FC -->|Create| HR
    HR -->|Pull| ECR
    FC -->|Create| HC
    HC -->|Install/Upgrade| DEPLOY
    HC -->|Install/Upgrade| SVC
    HC -->|Install/Upgrade| ING
    
    style FC fill:#4495d1,color:#fff
    style HC fill:#0f1689,color:#fff
    style ECR fill:#FF9900,color:#fff
```

**HelmRelease 동작**:
1. **Flux v2**가 GitRepository를 Watch
2. Git에서 **HelmRelease YAML** 파일 감지 (`.spec.chart.spec.sourceRef` 참조)
3. **HelmRepository**에서 ECR Helm Chart 이미지 Pull
4. **Helm Install** 또는 **Helm Upgrade** 실행
5. Kubernetes 리소스(Deployment, Service, Ingress) 생성

**HelmRelease 예시**:
```yaml
apiVersion: helm.toolkit.fluxcd.io/v2
kind: HelmRelease
metadata:
  name: example-tenant-premium
  namespace: flux-system
spec:
  releaseName: example-tenant-premium
  targetNamespace: example-tenant
  interval: 1m0s
  chart:
    spec:
      chart: helm-tenant-chart
      version: "0.x"
      sourceRef:
        kind: HelmRepository
        name: helm-tenant-chart
  values:
    tenantId: example-tenant
    apps:
      producer:
        enabled: true
      consumer:
        enabled: true
```

---

## 실습 2: SaaS 티어 전략

### SaaS 티어 모델 (Silo, Hybrid, Pool)

```mermaid
graph TB
    subgraph "SaaS Deployment Models"
        S[Silo Model<br/>Tenant별 독립 환경]
        H[Hybrid Model<br/>혼합 환경]
        P[Pool Model<br/>공유 환경]
    end
    
    subgraph "Silo (Tenant-1, Tenant-2)"
        S1[Web App 1]
        S2[Microservice 1-A]
        S3[Microservice 1-B]
        S4[DB 1]
        
        S5[Web App 2]
        S6[Microservice 2-A]
        S7[Microservice 2-B]
        S8[DB 2]
    end
    
    subgraph "Hybrid (Tenant-3, Tenant-4)"
        H1[Shared Web App]
        H2[Microservice 3]
        H3[Microservice 4]
        H4[DB 3]
        H5[DB 4]
    end
    
    subgraph "Pool (Tenant-5~N)"
        P1[Shared Web App]
        P2[Shared Microservice A]
        P3[Shared Microservice B]
        P4[Shared DB]
    end
    
    S --> S1
    H --> H1
    P --> P1
    
    style S fill:#f96,color:#fff
    style H fill:#fc6,color:#000
    style P fill:#6cf,color:#000
```

**SaaS 티어별 특징**:
- **Silo (Premium Tier)**: 테넌트별 독립 환경, 전용 리소스, 높은 격리성, 높은 비용
- **Hybrid (Advanced Tier)**: 일부 공유 + 일부 전용, 중간 격리성, 중간 비용
- **Pool (Basic Tier)**: 완전 공유 환경, 낮은 격리성, 낮은 비용

### 티어별 설정

이번 실습에서는 **Helm Release 템플릿**을 활용하여 각 테넌트별 SaaS 티어를 구현합니다:

| 티어 | Producer | Consumer | 인프라 | 비용 | 격리 수준 |
|------|----------|----------|--------|------|-----------|
| **Basic** | 공유 (pool-1) | 공유 (pool-1) | 공유 | 낮음 | 낮음 |
| **Advanced** | 공유 (pool-1) | 전용 | Hybrid | 중간 | 중간 |
| **Premium** | 전용 | 전용 | 전용 | 높음 | 높음 |

**핵심**: **values** 설정만으로 배포 방식이 결정되며, 각 티어별 Kubernetes 리소스 수준도 조절 가능

---

## 실습 3: 자동화된 테넌트 온보딩/오프보딩

### Argo Workflows 온보딩 워크플로우

```mermaid
graph LR
    subgraph "Trigger"
        SQS[Amazon SQS<br/>Onboarding Queue]
    end
    
    subgraph "Argo Workflows"
        SENSOR[Argo Events Sensor<br/>SQS 메시지 감지]
        WF[Argo Workflow<br/>tenant-onboarding]
    end
    
    subgraph "Workflow Steps"
        S1[1. Clone Repository]
        S2[2. Create Tenant<br/>HelmRelease YAML]
        S3[3. Git Push to Repo]
    end
    
    subgraph "Git Repository"
        GR[Gitea<br/>eks-saas-gitops]
    end
    
    subgraph "Flux v2"
        FC[Flux Controller<br/>Watch]
        HR[HelmRelease CRD]
    end
    
    subgraph "EKS Cluster"
        DEPLOY[Deployment<br/>Producer + Consumer]
    end
    
    SQS -->|Message| SENSOR
    SENSOR -->|Trigger| WF
    WF --> S1
    S1 --> S2
    S2 --> S3
    S3 --> GR
    GR -->|Watch| FC
    FC -->|Create| HR
    HR -->|Deploy| DEPLOY
    
    style SQS fill:#FF9900,color:#fff
    style WF fill:#f96,color:#fff
    style FC fill:#4495d1,color:#fff
    style HR fill:#0f1689,color:#fff
```

**온보딩 워크플로우 동작**:
1. **SQS 메시지 전송**: `{"tenant_id": "tenant-1", "tenant_tier": "basic", "release_version": "0.0.1"}`
2. **Argo Events Sensor**가 SQS 메시지 감지 → **Argo Workflow** 실행
3. **Workflow Steps**:
   - Git 저장소 Clone
   - 테넌트별 HelmRelease YAML 파일 생성 (티어별 템플릿 사용)
   - Git Repository에 Push
4. **Flux v2**가 Git 변경 감지 → **HelmRelease CRD** 생성
5. **Helm Install** 실행 → Kubernetes 리소스(Deployment, Service) 배포

**오프보딩 워크플로우**:
- `tenant-offboarding` Workflow 실행
- Git 저장소에서 해당 테넌트 HelmRelease 파일 삭제
- Flux v2가 변경 감지 → Kubernetes 리소스 삭제 (`destroyResourcesOnDeletion: true`)

---

## Mermaid 다이어그램 요약

이번 실습에서 추가한 7개의 Mermaid 다이어그램:

1. **GitOps 4대 원칙**: Declarative, Versioned and Immutable, Pulled Automatically, Continuously Reconciled
2. **Platform Engineering과 DevOps 진화**: DevOps → GitOps → Platform Engineering (3대 가치: 속도, 거버넌스, 효율성)
3. **EKS GitOps 전체 아키텍처**: Flux v2, Tofu 컨트롤러, Helm 컨트롤러, Argo Workflows 통합 구조
4. **SaaS 티어 모델**: Silo (Premium), Hybrid (Advanced), Pool (Basic) 배포 전략
5. **Flux v2 Reconciliation 흐름**: GitRepository → HelmRepository → HelmRelease → Kubernetes 리소스 배포
6. **Tofu 컨트롤러 + Terraform 실행 흐름**: Git Push → Flux → Terraform CRD → tf-runner Pod → AWS 리소스 프로비저닝
7. **Argo Workflows 온보딩 워크플로우**: SQS 메시지 → Argo Events → Workflow → Git Push → Flux → 배포

---

## 핵심 개념 정리

### GitOps vs Traditional CI/CD

| 항목 | Traditional CI/CD | GitOps |
|------|-------------------|--------|
| **배포 방식** | Push (CI 도구가 클러스터에 직접 배포) | Pull (클러스터가 Git 저장소를 감시하며 변경 사항 Pull) |
| **진실의 소스** | CI 도구 설정 | Git 저장소 |
| **상태 관리** | 수동 관리 | 자동 Drift 감지 및 복구 |
| **보안** | CI 도구에 클러스터 접근 권한 필요 | 클러스터가 Git 저장소만 접근 |
| **롤백** | 수동 롤백 | Git Revert로 자동 롤백 |

### Flux v2 vs Argo CD

| 항목 | Flux v2 | Argo CD |
|------|---------|---------|
| **핵심 기능** | CLI 중심, Tofu/Helm 컨트롤러 통합 | GUI 중심, 웹 UI 강력 |
| **아키텍처** | Kubernetes CRD 및 컨트롤러 | 멀티클러스터 지원 강력 |
| **Helm 지원** | ✅ (HelmRelease CRD) | ✅ (네이티브 RBAC 통합) |
| **커스터마이징** | ✅ | ✅ |
| **통합 GUI** | ❌ (CLI 위주) | ✅ (강력한 웹 UI) |
| **커뮤니티** | CNCF 졸업 프로젝트 | CNCF 졸업 프로젝트 |

**실무 선택 기준**:
- **Flux v2**: Terraform과의 통합이 필요하거나, CLI 기반 GitOps를 선호할 때
- **Argo CD**: 웹 UI를 통한 시각적 관리가 중요하거나, App-of-Apps 패턴을 사용할 때

### Argo Workflows vs Jenkins X

| 항목 | Argo Workflows | Jenkins X |
|------|----------------|-----------|
| **실행 환경** | Kubernetes Native (Pod 단위 Step) | Kubernetes 기반 Jenkins 통합 |
| **워크플로우 정의** | YAML (Kubernetes CRD) | Jenkinsfile (Groovy) |
| **GitOps 통합** | ✅ (Argo Events + Git 커밋) | ✅ (Lighthouse, Tekton) |
| **확장성** | 높음 (Kubernetes 스케일링) | 높음 (Jenkins 에이전트 확장) |
| **사용 사례** | 이벤트 드리븐 자동화, 배치 작업 | 기존 Jenkins 워크플로우 이관 |

---

## 마무리

이번 실습에서는 **GitOps 기반 CI/CD 파이프라인**을 구축하고, **Platform Engineering** 개념을 활용하여 **Multi-Tenant SaaS 플랫폼**을 구현했습니다.

### 핵심 학습 내용

1. **GitOps 4대 원칙**: Declarative, Versioned and Immutable, Pulled Automatically, Continuously Reconciled
2. **Platform Engineering**: 속도(Velocity), 거버넌스(Governance), 효율성(Efficiency)을 제공하는 Internal Developer Platform (IDP)
3. **Flux v2**: Git 저장소 변경 감지 → Kubernetes 리소스 자동 동기화
4. **Tofu 컨트롤러**: Terraform 코드를 GitOps 방식으로 실행 (AWS 리소스 프로비저닝)
5. **Helm 차트**: Kubernetes 애플리케이션 템플릿 (values 파일로 환경별 설정 Override)
6. **HelmRelease**: Flux v2가 제공하는 CRD, Helm 릴리스를 선언적으로 관리
7. **SaaS 티어 전략**: Basic (Pool), Advanced (Hybrid), Premium (Silo) 모델
8. **Argo Workflows**: SQS 메시지 기반 테넌트 온보딩/오프보딩 자동화

### 전체 자동화 흐름 요약

```
SQS 메시지 전송
  ↓
Argo Events → Argo Workflows → Git 커밋
  ↓
Flux → EKS 배포
  ↓
Tofu Controller → AWS 리소스 생성
```

**핵심**: 모든 티어가 동일한 Helm 차트를 사용하되, **values** 설정만으로 배포 방식이 결정되며, 새로운 티어 추가 시 기존 구조 수정 없이 새 템플릿 추가만으로 확장 가능합니다.
