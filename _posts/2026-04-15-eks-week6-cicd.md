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

### 1.1 시작하기

#### EKS 클러스터 준비

먼저 EKS 클러스터가 정상적으로 구성되었는지 확인합니다:

```bash
# EKS 클러스터 정보 확인
$ kubectl cluster-info

Kubernetes control plane is running at https://XXXXXXXXX.gr7.ap-northeast-2.eks.amazonaws.com
CoreDNS is running at https://XXXXXXXXX.gr7.ap-northeast-2.eks.amazonaws.com/api/v1/namespaces/kube-system/services/kube-dns:dns/proxy
```

#### Namespace 확인

GitOps 컨트롤러와 테넌트가 사용할 Namespace를 확인합니다:

```bash
# Namespace 목록 확인
$ kubectl get ns

NAME              STATUS   AGE
default           Active   42m
flux-system       Active   38m
kube-node-lease   Active   42m
kube-public       Active   42m
kube-system       Active   42m
gitea             Active   35m
argo-workflows    Active   30m
argo-events       Active   30m
```

**핵심 Namespace**:
- **flux-system**: Flux v2 컨트롤러 및 GitOps 리소스
- **gitea**: Git 저장소 (Gitea)
- **argo-workflows**: Argo Workflows 및 WorkflowTemplate
- **argo-events**: Argo Events 센서 및 이벤트 소스

#### Flux v2 리소스 확인

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

```bash
# GitRepository 리소스 확인
$ kubectl get gitrepository -n flux-system

NAME              URL                                        AGE   READY   STATUS
terraform-v0-0-1  http://admin:***@gitea:3000/admin/...      29m   True    stored artifact
```

```bash
# HelmRepository 리소스 확인
$ kubectl get helmrepository -n flux-system

NAME                URL                                                      AGE   READY   STATUS
helm-tenant-chart   oci://ACCOUNT_ID.dkr.ecr.ap-northeast-2.amazonaws.com   25m   True    Helm repository is ready
```

```bash
# Kustomization 리소스 확인
$ kubectl get kustomization -n flux-system

NAME                    AGE   READY   STATUS
flux-system             38m   True    Applied revision: main@sha1:abc123
terraform-v0-0-1        29m   True    Applied revision: v0.0.1@sha1:def456
```

**핵심 동작**:
- **flux-system** 네임스페이스에 **terraform-v0-0-1** GitRepository가 생성되어 있음
- Flux가 주기적으로 Git 저장소를 감시하며, 변경 사항 발생 시 Kubernetes 리소스 업데이트
- **HelmRepository**는 Amazon ECR에 저장된 Helm 차트를 OCI 형식으로 Pull

#### Gitea Git 저장소 구성

GitOps 방식으로 배포하려면 Git 저장소가 필요합니다. 이번 실습에서는 Gitea(Self-hosted Git)를 사용합니다:

```bash
# Gitea Pod 확인
$ kubectl get pod -n gitea

NAME                     READY   STATUS    RESTARTS   AGE
gitea-0                  1/1     Running   0          35m

# Gitea Service 확인
$ kubectl get svc -n gitea

NAME         TYPE        CLUSTER-IP      EXTERNAL-IP   PORT(S)          AGE
gitea        ClusterIP   10.100.50.100   <none>        3000/TCP         35m
gitea-ssh    ClusterIP   10.100.50.101   <none>        22/TCP           35m
```

**Gitea 저장소 구조**:
```
gitops-gitea-repo/
├── terraform/                    # Terraform 모듈 (AWS 리소스)
│   └── tenant-apps/
│       ├── main.tf
│       ├── variables.tf
│       └── outputs.tf
├── helm-releases/                # HelmRelease YAML 파일 (테넌트별)
│   ├── tier-basic/
│   ├── tier-advanced/
│   └── tier-premium/
└── helm-charts/                  # Helm 차트 템플릿
    ├── helm-tenant-chart/
    └── application-chart/
```

---

### 1.2 Terraform 및 OpenTofu 컨트롤러

#### Tofu 컨트롤러 동작 원리

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

**동작 흐름**:
1. Git 저장소에 Terraform 코드 Push (Git 커밋)
2. Flux가 변경 감지 → Tofu 컨트롤러가 **Terraform CRD** 생성
3. **tf-runner Pod**가 실행되어 Terraform 모듈 실행 (`terraform init`, `terraform plan`, `terraform apply`)
4. AWS 리소스(SQS, DynamoDB, IAM) 생성
5. Terraform State를 Kubernetes Secret에 저장 (`tfstate`, `tfplan`)

#### Terraform 모듈 구조

```bash
$ tree terraform/tenant-apps/

terraform/tenant-apps/
├── main.tf                   # 메인 Terraform 코드
├── variables.tf              # 입력 변수 정의
├── outputs.tf                # 출력 값 정의
└── versions.tf               # Provider 버전 관리
```

**main.tf 예시**:
```hcl
# SQS Queue (Producer → Consumer 메시지 전달)
resource "aws_sqs_queue" "tenant_queue" {
  count = var.enable_producer ? 1 : 0
  
  name                      = "${var.tenant_id}-queue"
  delay_seconds             = 0
  max_message_size          = 262144
  message_retention_seconds = 345600
  receive_wait_time_seconds = 0
  
  tags = {
    TenantId = var.tenant_id
    Tier     = var.tenant_tier
  }
}

# DynamoDB Table (Producer가 메시지 메타데이터 저장)
resource "aws_dynamodb_table" "tenant_table" {
  count = var.enable_producer ? 1 : 0
  
  name           = "${var.tenant_id}-table"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "id"
  
  attribute {
    name = "id"
    type = "S"
  }
  
  tags = {
    TenantId = var.tenant_id
    Tier     = var.tenant_tier
  }
}

# IAM Role for IRSA (Pod → AWS 리소스 접근)
resource "aws_iam_role" "tenant_role" {
  count = var.enable_producer || var.enable_consumer ? 1 : 0
  
  name = "${var.tenant_id}-role"
  
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Federated = var.oidc_provider_arn
      }
      Action = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "${var.oidc_provider}:sub" = "system:serviceaccount:${var.tenant_id}:${var.tenant_id}-sa"
          "${var.oidc_provider}:aud" = "sts.amazonaws.com"
        }
      }
    }]
  })
}
```

**variables.tf 예시**:
```hcl
variable "tenant_id" {
  description = "Tenant ID"
  type        = string
}

variable "tenant_tier" {
  description = "Tenant Tier (basic, advanced, premium)"
  type        = string
}

variable "enable_producer" {
  description = "Enable Producer resources (SQS, DynamoDB)"
  type        = bool
  default     = true
}

variable "enable_consumer" {
  description = "Enable Consumer resources"
  type        = bool
  default     = true
}

variable "oidc_provider_arn" {
  description = "EKS OIDC Provider ARN for IRSA"
  type        = string
}

variable "oidc_provider" {
  description = "EKS OIDC Provider URL (without https://)"
  type        = string
}
```

#### Terraform CRD 생성

Flux가 Git 저장소를 감지하면 자동으로 Terraform CRD를 생성합니다:

```yaml
apiVersion: infra.contrib.fluxcd.io/v1alpha2
kind: Terraform
metadata:
  name: tenant-example
  namespace: flux-system
spec:
  interval: 1m
  path: ./terraform/tenant-apps
  sourceRef:
    kind: GitRepository
    name: terraform-v0-0-1
  vars:
    - name: tenant_id
      value: "tenant-example"
    - name: tenant_tier
      value: "premium"
    - name: enable_producer
      value: "true"
    - name: enable_consumer
      value: "true"
    - name: oidc_provider_arn
      value: "arn:aws:iam::ACCOUNT_ID:oidc-provider/oidc.eks.ap-northeast-2.amazonaws.com/id/XXXXX"
    - name: oidc_provider
      value: "oidc.eks.ap-northeast-2.amazonaws.com/id/XXXXX"
  writeOutputsToSecret:
    name: tenant-example-outputs
  storeReadablePlan: human
  approvePlan: auto
```

**핵심 설정**:
- `sourceRef`: GitRepository 이름 (`terraform-v0-0-1`)
- `path`: Terraform 모듈 경로 (`./terraform/tenant-apps`)
- `vars`: Terraform 변수 전달
- `writeOutputsToSecret`: Terraform Outputs를 Kubernetes Secret에 저장
- `approvePlan: auto`: `terraform plan` 후 자동으로 `terraform apply` 실행

#### tf-runner Pod 실행

Terraform CRD가 생성되면 **tf-runner Pod**가 실행됩니다:

```bash
# tf-runner Pod 확인
$ kubectl get pod -n flux-system | grep tf-runner

tf-runner-tenant-example-xxxxxxx   0/1     Completed   0          2m
```

**Pod 로그 확인**:
```bash
$ kubectl logs -n flux-system tf-runner-tenant-example-xxxxxxx

Initializing the backend...
Initializing provider plugins...
- Reusing previous version of hashicorp/aws from the dependency lock file
- Using previously-installed hashicorp/aws v5.x.x

Terraform has been successfully initialized!

Terraform used the selected providers to generate the following execution plan:
  # aws_sqs_queue.tenant_queue[0] will be created
  + resource "aws_sqs_queue" "tenant_queue" {
      + name = "tenant-example-queue"
      ...
    }
  
  # aws_dynamodb_table.tenant_table[0] will be created
  + resource "aws_dynamodb_table" "tenant_table" {
      + name = "tenant-example-table"
      ...
    }

Plan: 3 to add, 0 to change, 0 to destroy.

Apply complete! Resources: 3 added, 0 changed, 0 destroyed.
```

#### Terraform State 저장

Terraform State는 Kubernetes Secret에 저장됩니다:

```bash
# Terraform State Secret 확인
$ kubectl get secret -n flux-system | grep tfstate

tfstate-default-tenant-example   Opaque   1      2m

# Secret 내용 확인
$ kubectl get secret -n flux-system tfstate-default-tenant-example -o jsonpath='{.data.tfstate}' | base64 -d | jq '.resources[] | {type, name}'

{
  "type": "aws_sqs_queue",
  "name": "tenant_queue"
}
{
  "type": "aws_dynamodb_table",
  "name": "tenant_table"
}
{
  "type": "aws_iam_role",
  "name": "tenant_role"
}
```

**중요**: `enable_producer`와 `enable_consumer` 옵션
- `enable_producer = false`: Producer 리소스(SQS, DynamoDB, IAM) 생성하지 않음
- `enable_consumer = false`: Consumer 리소스 생성하지 않음
- **Basic Tier**: `enable_producer = false` (공유 pool-1 사용)
- **Advanced Tier**: `enable_producer = false`, `enable_consumer = true` (Consumer만 전용)
- **Premium Tier**: `enable_producer = true`, `enable_consumer = true` (모두 전용)

---

### 1.3 Helm 차트

#### Helm 차트 디렉터리 구조

```bash
$ tree helm-charts/

helm-charts/
├── helm-tenant-chart/          # 테넌트별 애플리케이션 배포 (Producer + Consumer 통합)
│   ├── Chart.yaml
│   ├── templates/
│   │   ├── deployment.yaml     # Producer/Consumer Deployment
│   │   ├── service.yaml        # ClusterIP Service
│   │   ├── ingress.yaml        # ALB Ingress
│   │   ├── hpa.yaml            # Horizontal Pod Autoscaler
│   │   └── serviceaccount.yaml # IRSA ServiceAccount
│   ├── values.yaml             # 기본값
│   └── values.yaml.template    # 템플릿 (티어별 Override)
└── application-chart/          # Onboarding Service 동작
    ├── Chart.yaml
    └── templates/
```

**두 차트의 역할**:
- **helm-tenant-chart**: 테넌트별 배포 (Producer + Consumer 마이크로서비스)
- **application-chart**: 개발 애플리케이션을 배포 (Onboarding Service 등)

#### helm-tenant-chart 상세

**Chart.yaml**:
```yaml
apiVersion: v2
name: helm-tenant-chart
description: Multi-Tenant SaaS Application Chart
type: application
version: 0.0.1
appVersion: "1.0.0"
```

**values.yaml**:
```yaml
# Tenant 정보
tenantId: "default-tenant"
tier: "basic"

# Producer 설정
apps:
  producer:
    enabled: true
    image:
      repository: ACCOUNT_ID.dkr.ecr.ap-northeast-2.amazonaws.com/producer
      tag: "latest"
    replicas: 1
    resources:
      requests:
        cpu: 100m
        memory: 128Mi
      limits:
        cpu: 200m
        memory: 256Mi
    env:
      - name: TENANT_ID
        value: "{{ .Values.tenantId }}"
      - name: SQS_QUEUE_URL
        value: "https://sqs.ap-northeast-2.amazonaws.com/ACCOUNT_ID/{{ .Values.tenantId }}-queue"
      - name: DYNAMODB_TABLE_NAME
        value: "{{ .Values.tenantId }}-table"
    
  consumer:
    enabled: true
    image:
      repository: ACCOUNT_ID.dkr.ecr.ap-northeast-2.amazonaws.com/consumer
      tag: "latest"
    replicas: 1
    resources:
      requests:
        cpu: 100m
        memory: 128Mi
      limits:
        cpu: 200m
        memory: 256Mi
    env:
      - name: TENANT_ID
        value: "{{ .Values.tenantId }}"
      - name: SQS_QUEUE_URL
        value: "https://sqs.ap-northeast-2.amazonaws.com/ACCOUNT_ID/{{ .Values.tenantId }}-queue"

# Ingress 설정
ingress:
  enabled: true
  className: alb
  annotations:
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
  host: "{{ .Values.tenantId }}.example.com"

# IRSA ServiceAccount
serviceAccount:
  create: true
  name: "{{ .Values.tenantId }}-sa"
  annotations:
    eks.amazonaws.com/role-arn: "arn:aws:iam::ACCOUNT_ID:role/{{ .Values.tenantId }}-role"

# HPA 설정
hpa:
  enabled: true
  minReplicas: 1
  maxReplicas: 10
  targetCPUUtilizationPercentage: 80
```

#### ECR에 Helm 차트 업로드

Helm 차트를 Amazon ECR에 OCI 형식으로 업로드합니다:

```bash
# ECR 로그인
$ aws ecr get-login-password --region ap-northeast-2 | \
  helm registry login \
  --username AWS \
  --password-stdin ACCOUNT_ID.dkr.ecr.ap-northeast-2.amazonaws.com

Login Succeeded

# Helm 차트 패키징
$ cd helm-charts
$ helm package helm-tenant-chart

Successfully packaged chart and saved it to: /home/ec2-user/environment/helm-charts/helm-tenant-chart-0.0.1.tgz

# ECR에 Push
$ helm push helm-tenant-chart-0.0.1.tgz oci://ACCOUNT_ID.dkr.ecr.ap-northeast-2.amazonaws.com

Pushed: ACCOUNT_ID.dkr.ecr.ap-northeast-2.amazonaws.com/helm-tenant-chart:0.0.1
Digest: sha256:abc123def456...
```

**ECR에서 Helm 차트 확인**:
```bash
$ aws ecr describe-images \
  --repository-name helm-tenant-chart \
  --region ap-northeast-2

{
  "imageDetails": [
    {
      "imageDigest": "sha256:abc123def456...",
      "imageTags": ["0.0.1"],
      "imagePushedAt": "2026-04-15T10:30:00+09:00",
      "artifactMediaType": "application/vnd.cncf.helm.chart.config.v1+json"
    }
  ]
}
```

**Helm 차트 활용법**:
- `values.yaml` 파일 내 `values.yaml.template`의 필요 기본 값을 **Override**하여 설정
- 테스트 값은 **test-values.yaml** 파일을 만들고 Override 설정

---

### 1.4 Helm 차트의 Flux 통합

#### Flux v2 Reconciliation 흐름

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

**동작 흐름**:
1. **Flux v2**가 GitRepository를 Watch
2. Git에서 **HelmRelease YAML** 파일 감지 (`.spec.chart.spec.sourceRef` 참조)
3. **HelmRepository**에서 ECR Helm Chart 이미지 Pull
4. **Helm Install** 또는 **Helm Upgrade** 실행
5. Kubernetes 리소스(Deployment, Service, Ingress) 생성

#### HelmRepository 생성

먼저 Amazon ECR Helm 차트 저장소를 HelmRepository로 등록합니다:

```yaml
apiVersion: source.toolkit.fluxcd.io/v1beta2
kind: HelmRepository
metadata:
  name: helm-tenant-chart
  namespace: flux-system
spec:
  interval: 1m
  type: oci
  url: oci://ACCOUNT_ID.dkr.ecr.ap-northeast-2.amazonaws.com
```

```bash
# HelmRepository 확인
$ kubectl get helmrepository -n flux-system

NAME                URL                                                      AGE   READY   STATUS
helm-tenant-chart   oci://ACCOUNT_ID.dkr.ecr.ap-northeast-2.amazonaws.com   10m   True    Helm repository is ready
```

#### HelmRelease 생성 (Premium Tier)

**example-tenant-premium.yaml**:
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
      version: "0.0.1"
      sourceRef:
        kind: HelmRepository
        name: helm-tenant-chart
  values:
    tenantId: example-tenant
    tier: premium
    apps:
      producer:
        enabled: true
        image:
          repository: ACCOUNT_ID.dkr.ecr.ap-northeast-2.amazonaws.com/producer
          tag: "latest"
        replicas: 2
        resources:
          requests:
            cpu: 200m
            memory: 256Mi
          limits:
            cpu: 500m
            memory: 512Mi
        env:
          - name: TENANT_ID
            value: "example-tenant"
          - name: SQS_QUEUE_URL
            value: "https://sqs.ap-northeast-2.amazonaws.com/ACCOUNT_ID/example-tenant-queue"
          - name: DYNAMODB_TABLE_NAME
            value: "example-tenant-table"
          - name: ENVIRONMENT
            value: "premium"
      
      consumer:
        enabled: true
        image:
          repository: ACCOUNT_ID.dkr.ecr.ap-northeast-2.amazonaws.com/consumer
          tag: "latest"
        replicas: 2
        resources:
          requests:
            cpu: 200m
            memory: 256Mi
          limits:
            cpu: 500m
            memory: 512Mi
        env:
          - name: TENANT_ID
            value: "example-tenant"
          - name: SQS_QUEUE_URL
            value: "https://sqs.ap-northeast-2.amazonaws.com/ACCOUNT_ID/example-tenant-queue"
          - name: ENVIRONMENT
            value: "premium"
    
    ingress:
      enabled: true
      className: alb
      annotations:
        alb.ingress.kubernetes.io/scheme: internet-facing
        alb.ingress.kubernetes.io/target-type: ip
      host: "example-tenant.example.com"
    
    serviceAccount:
      create: true
      name: "example-tenant-sa"
      annotations:
        eks.amazonaws.com/role-arn: "arn:aws:iam::ACCOUNT_ID:role/example-tenant-role"
    
    hpa:
      enabled: true
      minReplicas: 2
      maxReplicas: 10
      targetCPUUtilizationPercentage: 70
```

#### Git에 Push 및 Flux Reconciliation

```bash
# Git 커밋
$ cd /home/ec2-user/environment/gitops-gitea-repo
$ git add helm-releases/tier-premium/example-tenant-premium.yaml
$ git commit -m "Add HelmRelease for example-tenant-premium"
$ git push origin main

# Flux가 Git 변경 감지 (1분 이내)
$ kubectl get gitrepository -n flux-system -w

NAME              URL                                        READY   STATUS
terraform-v0-0-1  http://admin:***@gitea:3000/admin/...      True    stored artifact: revision 'main@sha1:abc123'

# HelmRelease 생성 확인
$ kubectl get helmrelease -n flux-system

NAME                       AGE   READY   STATUS
example-tenant-premium     30s   True    Helm install succeeded

# Helm Release 확인
$ helm list -n example-tenant

NAME                       NAMESPACE         REVISION   UPDATED                                 STATUS     CHART                  APP VERSION
example-tenant-premium     example-tenant    1          2026-04-15 10:45:00.123456789 +0900 KST deployed   helm-tenant-chart-0.0.1 1.0.0
```

#### 배포된 리소스 확인

```bash
# Namespace 생성 확인
$ kubectl get ns example-tenant

NAME              STATUS   AGE
example-tenant    Active   1m

# Deployment 확인
$ kubectl get deployment -n example-tenant

NAME                            READY   UP-TO-DATE   AVAILABLE   AGE
example-tenant-premium-producer   2/2     2            2           1m
example-tenant-premium-consumer   2/2     2            2           1m

# Pod 확인
$ kubectl get pod -n example-tenant

NAME                                             READY   STATUS    RESTARTS   AGE
example-tenant-premium-producer-xxxxxxxxx-xxxxx  1/1     Running   0          1m
example-tenant-premium-producer-xxxxxxxxx-xxxxx  1/1     Running   0          1m
example-tenant-premium-consumer-xxxxxxxxx-xxxxx  1/1     Running   0          1m
example-tenant-premium-consumer-xxxxxxxxx-xxxxx  1/1     Running   0          1m

# Service 확인
$ kubectl get svc -n example-tenant

NAME                            TYPE        CLUSTER-IP      EXTERNAL-IP   PORT(S)    AGE
example-tenant-premium-producer ClusterIP   10.100.10.100   <none>        8080/TCP   1m
example-tenant-premium-consumer ClusterIP   10.100.10.101   <none>        8080/TCP   1m

# Ingress 확인
$ kubectl get ingress -n example-tenant

NAME                       CLASS   HOSTS                          ADDRESS                                    PORTS   AGE
example-tenant-premium     alb     example-tenant.example.com     k8s-examplet-xxxxxxxx-xxxxxxxxxx.elb...    80      1m

# ServiceAccount 확인 (IRSA)
$ kubectl get sa -n example-tenant example-tenant-sa -o yaml

apiVersion: v1
kind: ServiceAccount
metadata:
  annotations:
    eks.amazonaws.com/role-arn: arn:aws:iam::ACCOUNT_ID:role/example-tenant-role
  name: example-tenant-sa
  namespace: example-tenant
```

#### kustomization.yaml을 통한 배포

여러 HelmRelease를 한 번에 관리하려면 `kustomization.yaml`을 사용합니다:

```yaml
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
metadata:
  name: tenant-releases
  namespace: flux-system
spec:
  interval: 1m
  path: ./helm-releases
  prune: true
  sourceRef:
    kind: GitRepository
    name: terraform-v0-0-1
```

```bash
# Kustomization 확인
$ kubectl get kustomization -n flux-system

NAME                    AGE   READY   STATUS
tenant-releases         5m    True    Applied revision: main@sha1:abc123
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

| 티어 | Producer | Consumer | 인프라 | 비용 | 격리 수준 |
|------|----------|----------|--------|------|-----------|
| **Basic** | 공유 (pool-1) | 공유 (pool-1) | 공유 | 낮음 | 낮음 |
| **Advanced** | 공유 (pool-1) | 전용 | Hybrid | 중간 | 중간 |
| **Premium** | 전용 | 전용 | 전용 | 높음 | 높음 |

**핵심**: **values** 설정만으로 배포 방식이 결정되며, 각 티어별 Kubernetes 리소스 수준도 조절 가능

### 티어별 HelmRelease 생성

**Basic Tier 예시**:
```yaml
spec:
  values:
    tenantId: tenant-basic
    tier: basic
    apps:
      producer:
        enabled: false  # pool-1 공유 사용
        env:
          - name: SQS_QUEUE_URL
            value: "https://sqs.../pool-1-queue"  # 공유 Queue
      consumer:
        enabled: false  # pool-1 공유 사용
```

**Advanced Tier 예시**:
```yaml
spec:
  values:
    tenantId: tenant-advanced
    tier: advanced
    apps:
      producer:
        enabled: false  # pool-1 공유 사용
        env:
          - name: SQS_QUEUE_URL
            value: "https://sqs.../pool-1-queue"
          - name: ENVIRONMENT
            value: "pool-1"
      consumer:
        enabled: true  # 전용 Consumer
        env:
          - name: ENVIRONMENT
            value: "tenant-3"
```

**Premium Tier 예시**:
```yaml
spec:
  values:
    tenantId: tenant-premium
    tier: premium
    apps:
      producer:
        enabled: true  # 전용 Producer
        env:
          - name: SQS_QUEUE_URL
            value: "https://sqs.../tenant-premium-queue"
          - name: ENVIRONMENT
            value: "tenant-premium"
      consumer:
        enabled: true  # 전용 Consumer
        env:
          - name: ENVIRONMENT
            value: "tenant-premium"
```

### 티어별 배포 확인

```bash
# Premium Tier 확인
$ kubectl get pod -n tenant-premium

NAME                            READY   STATUS    RESTARTS   AGE
tenant-premium-producer-xxx     1/1     Running   0          2m
tenant-premium-consumer-xxx     1/1     Running   0          2m

# Advanced Tier 확인 (Consumer만 존재)
$ kubectl get pod -n tenant-advanced

NAME                            READY   STATUS    RESTARTS   AGE
tenant-advanced-consumer-xxx    1/1     Running   0          2m

# Basic Tier 확인 (Producer/Consumer 모두 pool-1 환경 사용, 별도 Pod 없음)
$ kubectl get pod -n tenant-basic

No resources found in tenant-basic namespace.
```

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
1. **SQS 메시지 전송**: `{"tenant_id": "tenant-3", "tenant_tier": "advanced", "release_version": "0.0.1"}`
2. **Argo Events Sensor**가 SQS 메시지 감지 → **Argo Workflow** 실행
3. **Workflow Steps**: Git Clone → HelmRelease YAML 생성 → Git Push
4. **Flux v2**가 Git 변경 감지 → **HelmRelease CRD** 생성
5. **Helm Install** 실행 → Kubernetes 리소스(Deployment, Service) 배포

### 온보딩 실행

```bash
# SQS 메시지 전송 (테넌트 온보딩 요청)
$ export ARGO_WORKFLOWS_ONBOARDING_QUEUE_SQS_URL=$(kubectl get configmap -n flux-system ...)
$ aws sqs send-message \
  --queue-url $ARGO_WORKFLOWS_ONBOARDING_QUEUE_SQS_URL \
  --message-body '{"tenant_id": "tenant-tldbc", "tenant_tier": "advanced", "release_version": "0.0.1"}'

# Argo Workflow 확인
$ kubectl -n argo-workflows get workflow

NAME                               STATUS    AGE
tenant-onboarding-gzt45            Running   9s

# Argo Workflows Web UI 확인
$ ARGO_WORKFLOW_URL=$(kubectl -n argo-workflows get svc/argo-workflows-server -o json | jq -r '.status.loadBalancer.ingress[0].hostname')
$ echo http://$ARGO_WORKFLOW_URL:2746/workflows

# Gitea에서 HelmRelease 커밋 확인
# - 브랜치: tier-advanced
# - 파일: helm-releases/tier-advanced/tenant-tldbc.yaml
```

### 오프보딩 실행

```bash
# SQS 메시지 전송 (테넌트 오프보딩 요청)
$ export ARGO_WORKFLOWS_OFFBOARDING_QUEUE_SQS_URL=$(kubectl get configmap -n flux-system ...)
$ aws sqs send-message \
  --queue-url $ARGO_WORKFLOWS_OFFBOARDING_QUEUE_SQS_URL \
  --message-body '{"tenant_id": "tenant-tldbc", "tenant_tier": "advanced"}'

# Argo Workflow 확인
$ kubectl -n argo-workflows get workflow

NAME                               STATUS    AGE
tenant-offboarding-gptkz           Running   9s

# Gitea에서 HelmRelease 삭제 커밋 확인 (destroyResourcesOnDeletion: true)
# - 브랜치: tier-advanced
# - 커밋 메시지: "Removing tenant: tenant-tldbc in tier: advanced"
```

### 전체 자동화 흐름 요약

| 구성 요소 | 역할 |
|-----------|------|
| **Amazon SQS** | 온보딩/오프보딩 트리거 메시지 수신 |
| **Argo Events** | SQS 메시지 감지 및 워크플로우 트리거 |
| **Argo Workflows** | 템플릿 기반 Git 커밋 생성 및 자동 커밋 |
| **Flux v2** | Git 변경 감지 → EKS 리소스 배포 |
| **Tofu 컨트롤러** | Terraform CRD 기반 AWS 인프라 프로비저닝 |

**핵심 흐름**:
```
SQS 메시지 1개 전송 
  → Argo Events → Argo Workflows → Git 커밋 
  → Flux → EKS 배포 
  → Tofu Controller → AWS 리소스 생성
```

---

## 실습 4: 리소스 확인 및 테스트

### 배포 검증

```bash
# Premium Tier Deployment 확인
$ kubectl get deployment -n tenant-premium

NAME                            READY   UP-TO-DATE   AVAILABLE   AGE
tenant-premium-producer         2/2     2            2           5m
tenant-premium-consumer         2/2     2            2           5m

# Basic Tier Deployment 확인
$ kubectl get deployment -n tenant-basic

# (결과 없음 - pool-1 환경 공유 사용)

# Advanced Tier Deployment 확인
$ kubectl get deployment -n tenant-advanced

NAME                            READY   UP-TO-DATE   AVAILABLE   AGE
tenant-advanced-consumer        2/2     2            2           5m
```

### 환경 변수 확인 (티어별 차이)

```bash
# Premium Tier (전용 환경)
$ kubectl exec -n tenant-premium deployment/tenant-premium-producer -- env | grep ENVIRONMENT

ENVIRONMENT=tenant-premium

# Advanced Tier (Hybrid 환경)
$ kubectl exec -n tenant-advanced deployment/tenant-advanced-consumer -- env | grep ENVIRONMENT

ENVIRONMENT=tenant-3  # Consumer만 전용, Producer는 pool-1 사용

# DynamoDB 데이터 확인
$ aws dynamodb scan --table-name tenant-premium-table --region ap-northeast-2 | jq '.Items'

# SQS 메시지 확인
$ aws sqs receive-message --queue-url https://sqs.../tenant-premium-queue --region ap-northeast-2
```

---

## 참고 자료

### Argo Image Updater

**ArgoCD Image Updater** 패턴: Git 저장소를 감시하여 새 컨테이너 이미지가 Push되면 자동으로 매니페스트를 업데이트하는 패턴입니다.

**동작 흐름**:
1. Build → CI Push → Container Registry
2. ArgoCD Image Updater가 Registry Watch
3. 새 이미지 감지 시 Git Repository에 Image Tag 자동 업데이트
4. ArgoCD가 Git 변경 감지 → Kubernetes 배포

**참고 링크**:
- [argo CD Image Updater - Blog](https://malwareanalysis.tistory.com/478)
- [ArgoCD 배포에 레벨링 하기* - Blog](https://beer1.tistory.com/68)
- [[CD] ArgoCD Image Updater를 활용한 Continuous Delivery w/AWS ECR - Blog](https://productkeycabook.co.kr/detail/47287090)

### Argo CD App-of-apps

**App-of-Apps 패턴**: Root Application이 Child Applications을 관리하는 구조로, 여러 애플리케이션을 계층적으로 배포합니다.

**구조**:
```
apps (Root Application)
├── helm-guestbook (Child Application)
├── helm-hooks (Child Application)
├── kustomize-guestbook (Child Application)
└── sync-waves (Child Application)
```

**장점**:
- 중앙 집중식 애플리케이션 관리
- 클러스터 부트스트랩핑 간소화
- GitOps 친화적

**참고 링크**:
- [ArgoCD Docs - Cluster Boostrapping: app of apps pattern](https://argo-cd.readthedocs.io/en/stable/operator-manual/cluster-bootstrapping/)
- [ArgoCD Example Apps - Github](https://github.com/argoproj/argocd-example-apps)

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
3. **Flux v2**: GitRepository Watch → HelmRepository Pull → HelmRelease 생성 → Kubernetes 리소스 자동 동기화
4. **Tofu 컨트롤러**: Terraform CRD를 통해 tf-runner Pod 실행 → AWS 리소스 프로비저닝 (SQS, DynamoDB, IAM)
5. **Helm 차트**: ECR에 OCI 형식으로 저장, values 파일로 환경별 설정 Override
6. **HelmRelease**: Flux v2가 제공하는 CRD, Helm 릴리스를 선언적으로 관리
7. **SaaS 티어 전략**: Basic (Pool, 공유 환경), Advanced (Hybrid, Consumer만 전용), Premium (Silo, 모두 전용)
8. **Argo Workflows**: SQS 메시지 → Argo Events → Workflow 실행 → Git 커밋 → Flux 배포 (완전 자동화)

### 전체 자동화 흐름 요약

```
SQS 메시지 1개 전송
  ↓
Argo Events → Argo Workflows → Git 커밋
  ↓
Flux → EKS 배포 (HelmRelease)
  ↓
Tofu Controller → AWS 리소스 생성 (SQS, DynamoDB, IAM)
```

**핵심**: 모든 티어가 동일한 Helm 차트를 사용하되, **values** 설정만으로 배포 방식이 결정됩니다. 새로운 티어 추가 시 기존 구조 수정 없이 새 템플릿만 추가하면 됩니다 (확장성).

GitOps 방식으로 **Git = Single Source of Truth**를 유지하며, 변경 사항은 모두 Git 커밋으로 추적 가능하고 Rollback도 간단합니다 (Declarative + Versioned).

---

## 참고 자료

### 주요 도구

- [Flux v2 공식 문서](https://fluxcd.io/flux/)
- [Argo Workflows 공식 문서](https://argo-workflows.readthedocs.io/)
- [Argo Events 공식 문서](https://argoproj.github.io/argo-events/)
- [Tofu 컨트롤러 (tf-controller) - GitHub](https://github.com/flux-iac/tofu-controller)
- [Helm 공식 문서](https://helm.sh/docs/)

### GitOps 및 Platform Engineering

- [GitOps - CNCF](https://opengitops.dev/)
- [Platform Engineering - CNCF](https://www.cncf.io/blog/2023/02/14/what-is-platform-engineering/)
- [Internal Developer Platform (IDP)](https://internaldeveloperplatform.org/)

### Argo CD 관련

- [Argo Image Updater - KrBlog](https://malwareanalysis.tistory.com/478)
- [ArgoCD App-of-apps Pattern - Docs](https://argo-cd.readthedocs.io/en/stable/operator-manual/cluster-bootstrapping/)
- [ArgoCD Example Apps - GitHub](https://github.com/argoproj/argocd-example-apps)

### EKS

- [Amazon EKS 공식 문서](https://docs.aws.amazon.com/eks/)
- [EKS Best Practices - GitHub](https://aws.github.io/aws-eks-best-practices/)
