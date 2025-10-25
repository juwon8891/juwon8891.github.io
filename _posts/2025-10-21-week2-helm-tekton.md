---
layout: post
title: "2주차 학습정리 - Helm과 Tekton: GitOps 패키지 관리 및 CI/CD"
date: 2025-10-21
categories: [학습정리, GitOps, Helm, Tekton]
---

# 2주차 학습정리 - Helm과 Tekton: GitOps 패키지 관리 및 CI/CD

## 📋 목차

1. [📦 Helm: 쿠버네티스 패키지 관리자](#-helm-쿠버네티스-패키지-관리자)
   - [Helm 소개 및 핵심 개념](#1-helm-소개-및-핵심-개념)
   - [Helm 프로젝트 생성](#2-helm-프로젝트-생성-51절)
   - [템플릿 재사용](#3-템플릿-재사용-52절)
   - [컨테이너 이미지 업데이트](#4-컨테이너-이미지-업데이트-53절)
   - [차트 패키징 및 배포](#5-차트-패키징-및-배포-54절)
   - [저장소에서 차트 배포](#6-저장소에서-차트-배포-55절)
   - [의존성이 있는 차트 배포](#7-의존성이-있는-차트-배포-56절)
   - [ConfigMap 변경 시 자동 롤링 업데이트](#8-configmap-변경-시-자동-롤링-업데이트-57절)

2. [🔄 Tekton: 클라우드 네이티브 CI/CD](#-tekton-클라우드-네이티브-cicd)
   - [Tekton 소개 및 핵심 개념](#1-tekton-소개-및-핵심-개념)
   - [Tekton 설치](#2-tekton-설치-61절)
   - [Hello World Task 생성](#3-hello-world-task-생성-62절)
   - [Git 저장소에서 앱 빌드](#4-git-저장소에서-앱-빌드-63절)

3. [📊 2주차 학습 정리](#-2주차-학습-정리)
   - [핵심 성취 목표](#1-핵심-성취-목표)
   - [실무 적용 포인트](#2-실무-적용-포인트)
   - [다음 단계 학습 방향](#3-다음-단계-학습-방향)
   - [주요 명령어 치트시트](#4-주요-명령어-치트시트)

---

## 📦 Helm: 쿠버네티스 패키지 관리자

### 1. Helm 소개 및 핵심 개념

#### Helm이란?

Helm은 쿠버네티스 애플리케이션을 위한 패키지 관리자입니다. Kustomize와 유사하지만 템플릿 기반 솔루션이며, 버전 관리, 공유, 배포 가능한 아티팩트를 생성할 수 있습니다.

#### Kustomize vs Helm 비교

| 측면 | Kustomize | Helm |
|------|-----------|------|
| **접근 방식** | Overlay 기반 패치 | 템플릿 기반 생성 |
| **설정 방법** | kustomization.yaml | values.yaml |
| **버전 관리** | Git 기반 | Chart 버전 관리 |
| **패키징** | 불가 | .tgz 패키지 생성 |
| **저장소** | 없음 | Chart Repository |
| **의존성 관리** | 제한적 | 강력한 의존성 관리 |
| **롤백** | Git 기반 | helm rollback 지원 |
| **학습 곡선** | 낮음 | 중간 (Go 템플릿 학습 필요) |

#### Helm의 핵심 구성 요소

<div class="mermaid">
graph TB
    A[Chart.yaml<br/>차트 메타데이터] --> D[Helm Chart]
    B[values.yaml<br/>기본 설정값] --> D
    C[templates/<br/>K8s 매니페스트 템플릿] --> D
    D --> E[helm install]
    E --> F[Release<br/>배포된 인스턴스]
    F --> G[K8s Resources<br/>Deployment, Service, etc.]

    H[values-prod.yaml<br/>환경별 설정] -.-> E
    I[_helpers.tpl<br/>재사용 템플릿] --> C
</div>

#### 주요 개념

- **Chart**: 쿠버네티스 애플리케이션을 정의하는 파일들의 묶음
- **Release**: 클러스터에 배포된 Chart의 인스턴스
- **Repository**: Chart들을 저장하고 공유하는 저장소
- **Values**: Chart의 설정값을 정의하는 파일

### 2. Helm 프로젝트 생성 (5.1절)

#### Helm Chart 디렉토리 구조

```bash
pacman/
├── Chart.yaml          # 차트 메타데이터 (이름, 버전, 설명)
├── values.yaml         # 기본 설정값
├── templates/          # 쿠버네티스 매니페스트 템플릿
│   ├── deployment.yaml # Deployment 템플릿
│   ├── service.yaml    # Service 템플릿
│   └── _helpers.tpl    # 재사용 가능한 템플릿 함수
└── charts/             # 의존성 차트들 (하위 차트)
```

#### Chart.yaml 파일 구조

```yaml
apiVersion: v2              # Helm 3의 API 버전
name: pacman                # 차트 이름
description: A Helm chart for Pacman
type: application           # application 또는 library
version: 0.1.0             # 차트 버전 (차트 정의가 바뀌면 업데이트)
appVersion: "1.0.0"        # 애플리케이션 버전 (앱이 바뀌면 업데이트)
```

**버전 필드의 차이점:**

- `version`: 차트 자체의 버전 (템플릿, 구조 변경 시 업데이트)
- `appVersion`: 애플리케이션의 버전 (컨테이너 이미지 버전)
- 두 필드는 서로 독립적이며 다른 목적으로 사용됨

#### deployment.yaml 템플릿 예시

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ .Chart.Name }}              # Chart.yaml의 name 필드 참조
  labels:
    app.kubernetes.io/name: {{ .Chart.Name }}
    {{- if .Chart.AppVersion }}
    app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}  # 따옴표 추가
    {{- end }}
spec:
  replicas: {{ .Values.replicaCount }} # values.yaml의 값 참조
  selector:
    matchLabels:
      app.kubernetes.io/name: {{ .Chart.Name }}
  template:
    metadata:
      labels:
        app.kubernetes.io/name: {{ .Chart.Name }}
    spec:
      containers:
      - image: "{{ .Values.image.repository }}:{{ .Values.image.tag | default .Chart.AppVersion }}"
        imagePullPolicy: {{ .Values.image.pullPolicy }}
        securityContext:
          {{- toYaml .Values.securityContext | nindent 14 }}  # YAML 객체를 14칸 들여쓰기
        name: {{ .Chart.Name }}
        ports:
        - containerPort: {{ .Values.image.containerPort }}
          name: http
          protocol: TCP
```

#### Go 템플릿 문법 핵심

- `{{ .Chart.Name }}`: Chart.yaml의 name 값 참조
- `{{ .Values.key }}`: values.yaml의 값 참조
- `{{ .Values.image.tag | default .Chart.AppVersion }}`: 파이프를 사용한 기본값 설정
- `{{ .Chart.AppVersion | quote }}`: 따옴표로 감싸기
- `{{- if .Chart.AppVersion }}`: 조건문 (앞 공백 제거)
- `{{- toYaml .Values.securityContext | nindent 14 }}`: YAML 변환 및 들여쓰기

#### values.yaml 기본 설정

```yaml
image:
  repository: quay.io/gitops-cookbook/pacman-kikd
  tag: "1.0.0"
  pullPolicy: Always
  containerPort: 8080

replicaCount: 1

# securityContext를 YAML 객체로 정의
securityContext: {}
# 또는 구체적인 값 지정:
# securityContext:
#   capabilities:
#     drop:
#     - ALL
#   readOnlyRootFilesystem: true
#   runAsNonRoot: true
#   runAsUser: 1000
```

#### Helm 차트 로컬 렌더링

```bash
# 기본 values로 렌더링
helm template .

# 특정 값을 override하여 렌더링
helm template --set replicaCount=3 .

# 여러 값을 동시에 override
helm template \
  --set replicaCount=3 \
  --set image.tag="2.0.0" \
  .
```

#### Helm 차트 배포 및 관리

```bash
# 차트 설치
helm install pacman .

# 배포된 릴리스 확인
helm list

# 릴리스 히스토리 확인
helm history pacman

# 릴리스 업그레이드
helm upgrade pacman --reuse-values --set replicaCount=2 .

# 이전 버전으로 롤백
helm rollback pacman 1

# 릴리스 삭제
helm uninstall pacman
```

#### Helm의 메타데이터 저장 방식

Helm은 배포 릴리스 메타데이터를 쿠버네티스 Secret에 저장합니다:

```bash
# Secret 확인
kubectl get secret
# sh.helm.release.v1.pacman.v1    helm.sh/release.v1   1      5m
# sh.helm.release.v1.pacman.v2    helm.sh/release.v1   1      20s

# 배포 정보 확인
helm get all pacman        # 모든 정보
helm get values pacman     # 적용된 values
helm get manifest pacman   # 렌더링된 매니페스트
helm get notes pacman      # 차트 notes
```

### 3. 템플릿 재사용 (5.2절)

#### 문제 상황: 중복 코드

deployment.yaml과 service.yaml에서 동일한 selector 정의가 반복됩니다:

```yaml
# deployment.yaml
spec:
  selector:
    matchLabels:
      app.kubernetes.io/name: {{ .Chart.Name }}  # 중복 1
  template:
    metadata:
      labels:
        app.kubernetes.io/name: {{ .Chart.Name }}  # 중복 2

# service.yaml
spec:
  selector:
    app.kubernetes.io/name: {{ .Chart.Name }}  # 중복 3
```

이 경우 selector 필드에 새 레이블을 추가하려면 3곳을 모두 수정해야 합니다.

#### 해결책: _helpers.tpl 사용

```yaml
# templates/_helpers.tpl
{{- define "pacman.selectorLabels" -}}
app.kubernetes.io/name: {{ .Chart.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion }}
{{- end }}
```

#### 템플릿 함수 사용

```yaml
# deployment.yaml
spec:
  selector:
    matchLabels:
      {{- include "pacman.selectorLabels" . | nindent 6 }}
  template:
    metadata:
      labels:
        {{- include "pacman.selectorLabels" . | nindent 8 }}

# service.yaml
spec:
  selector:
    {{- include "pacman.selectorLabels" . | nindent 6 }}
```

#### _helpers.tpl 파일 규칙

- 파일명은 `_`로 시작해야 함 (예: `_helpers.tpl`, `_utils.tpl`)
- `_`로 시작하는 파일은 쿠버네티스 매니페스트로 취급되지 않음
- 재사용 가능한 템플릿 함수 정의에 사용
- `{{- define "이름" -}}...{{- end }}` 형식으로 정의

#### include 함수의 파이프라인

```yaml
{{- include "pacman.selectorLabels" . | nindent 6 }}
```

- `include`: 정의된 템플릿을 호출
- `.`: 현재 컨텍스트를 전달
- `| nindent 6`: 결과를 6칸 들여쓰기

### 4. 컨테이너 이미지 업데이트 (5.3절)

#### Helm 릴리스 라이프사이클

<div class="mermaid">
graph LR
    A[helm install<br/>v1.0.0] --> B[Revision 1<br/>deployed]
    B --> C[helm upgrade<br/>v1.1.0]
    C --> D[Revision 2<br/>deployed]
    D --> E[helm rollback<br/>to Revision 1]
    E --> F[Revision 3<br/>v1.0.0 deployed]

    B -.Secret.-> G[sh.helm.release.v1.pacman.v1]
    D -.Secret.-> H[sh.helm.release.v1.pacman.v2]
    F -.Secret.-> I[sh.helm.release.v1.pacman.v3]

    style B fill:#e8f5e9
    style D fill:#fff3e0
    style F fill:#e1f5fe
</div>

#### 이미지 버전 업그레이드

```bash
# values.yaml에서 이미지 태그 업데이트
cat << EOF > values.yaml
image:
  repository: quay.io/gitops-cookbook/pacman-kikd
  tag: "1.1.0"  # 1.0.0에서 1.1.0으로 업데이트
  pullPolicy: Always
  containerPort: 8080
replicaCount: 1
securityContext: {}
EOF

# Chart.yaml에서 appVersion 업데이트
cat << EOF > Chart.yaml
apiVersion: v2
name: pacman
description: A Helm chart for Pacman
type: application
version: 0.1.0
appVersion: "1.1.0"  # 애플리케이션 버전 업데이트
EOF

# 업그레이드 실행
helm upgrade pacman .
```

#### 업그레이드 결과 확인

```bash
# 히스토리 확인
helm history pacman
# REVISION  UPDATED                   STATUS        CHART           APP VERSION
# 1         Sat Oct 18 17:00:00 2025  superseded    pacman-0.1.0    1.0.0
# 2         Sat Oct 18 18:15:47 2025  deployed      pacman-0.1.0    1.1.0

# Deployment와 ReplicaSet 확인
kubectl get deploy,replicaset -owide

# Secret 확인 (새 리비전 추가됨)
kubectl get secret
# sh.helm.release.v1.pacman.v1
# sh.helm.release.v1.pacman.v2
```

#### 이전 버전으로 롤백

```bash
# 리비전 1로 롤백
helm rollback pacman 1

# 롤백 확인
helm history pacman
# REVISION  UPDATED                   STATUS        CHART           APP VERSION
# 1         Sat Oct 18 17:00:00 2025  superseded    pacman-0.1.0    1.0.0
# 2         Sat Oct 18 18:15:47 2025  superseded    pacman-0.1.0    1.1.0
# 3         Sat Oct 18 18:20:00 2025  deployed      pacman-0.1.0    1.0.0

kubectl get deploy,replicaset -owide
```

#### Values 파일 Override

```bash
# 새 values 파일 생성
cat << EOF > newvalues.yaml
image:
  tag: "1.2.0"  # 이 값만 override
EOF

# 새 values 파일과 함께 템플릿 렌더링
helm template pacman -f newvalues.yaml .
# 결과: values.yaml의 기본값을 사용하되, image.tag만 1.2.0으로 override

# 설치 시 여러 values 파일 사용
helm install pacman -f values.yaml -f newvalues.yaml .

# 명령줄에서 직접 값 override
helm install pacman --set image.tag="1.2.0" .

# 여러 값 동시 override
helm install pacman \
  --set image.tag="1.2.0" \
  --set replicaCount=3 \
  .
```

### 5. 차트 패키징 및 배포 (5.4절)

#### Helm Chart Repository 구조

```
repo/
├── index.yaml           # 차트 메타데이터 인덱스
└── pacman-0.1.0.tgz    # 패키징된 차트
```

#### 차트 패키징

```bash
# 차트를 .tgz 파일로 패키징
helm package .
# Successfully packaged chart and saved it to: .../pacman/pacman-0.1.0.tgz

# 패키지 내용 확인
gzcat pacman-0.1.0.tgz

# 또는
tar -tzf pacman-0.1.0.tgz
```

#### 차트 저장소 인덱스 생성

```bash
# index.yaml 파일 생성
helm repo index .

# index.yaml 내용
cat index.yaml
```

```yaml
apiVersion: v1
entries:
  pacman:
  - apiVersion: v2
    appVersion: 1.1.0
    created: "2025-10-18T18:33:41.240749+09:00"
    description: A Helm chart for Pacman
    digest: 1a68e0069016d96ab64344e2d4c2fde2b7368e410f93da90bf19f6ed8ca9495a
    name: pacman
    type: application
    urls:
    - pacman-0.1.0.tgz
    version: 0.1.0
generated: "2025-10-18T18:33:41.239645+09:00"
```

#### Bitnami Chart Registry 변경 사항

2025년 8월부터 Bitnami의 Docker Hub 공개 카탈로그가 중단되고 새로운 방식으로 전환되었습니다:

**1. Bitnami Secure Images (BSI)** - 프로덕션 환경용

```bash
# Docker Hub에서 43종의 보안 강화 이미지 제공
docker pull bitnamisecure/nginx:latest

# 실행
docker run -d -p 8080:8080 --name nginx bitnamisecure/nginx:latest
curl -s 127.0.0.1:8080
```

**2. Bitnami Legacy Registry** - 2025년 8월부터 업데이트 없음

```bash
# 기존 이미지는 계속 사용 가능하지만 업데이트 없음
docker pull bitnamilegacy/nginx:1.28.0-debian-12-r4
```

**3. OCI Registry** - 권장되는 새로운 방식

<div class="mermaid">
graph LR
    A[기존 Helm Repo 방식] --> B[별도 Helm Repo 서버 필요]
    A --> C[helm repo add/update]

    D[새로운 OCI 방식] --> E[Docker Registry 활용]
    D --> F[helm install oci://...]

    E --> G[장점]
    G --> G1[별도 repo 관리 불필요]
    G --> G2[Docker 인증 재사용]
    G --> G3[CI/CD 친화적]
    G --> G4[표준화된 방식]
</div>

#### 기존 Helm Repo vs OCI 방식 비교

| 항목 | Helm Repo 방식 (기존) | OCI 방식 (신규) |
|------|---------------------|----------------|
| **저장소** | 별도의 Helm repo (https://charts.bitnami.com/bitnami) | OCI Container Registry (registry-1.docker.io) |
| **배포** | `helm repo add`, `helm repo update`, `helm install` | `helm install oci://...` |
| **인증** | repo 서버 인증 필요 | Docker registry 인증 방식 사용 |
| **보안** | 별도 관리 필요 | 기존 Docker registry 보안 정책 재사용 |
| **장점** | 익숙한 방식 | CI/CD 친화적, repo 관리 불필요, 표준화 |
| **단점** | 별도 repo 서버 필요 | Helm 3.8 이상 필요 |

#### OCI Registry 주소 예시

| Registry | 예시 주소 |
|----------|---------|
| Docker Hub | `oci://registry-1.docker.io/<namespace>/<chart>` |
| GitHub | `oci://ghcr.io/<user>/<chart>` |
| Harbor | `oci://harbor.mycompany.com/helm/<chart>` |
| GCP | `oci://us-docker.pkg.dev/<project>/helm/<chart>` |

#### Bitnami Helm Charts (OCI 방식)

```bash
# 기존 repo 확인
helm repo list

# OCI 방식으로 차트 가져오기
helm pull oci://registry-1.docker.io/bitnamicharts/nginx --version 22.0.11

# 파일 목록 확인
tar -tf nginx-22.0.11.tgz

# 차트 정보 확인
helm show readme oci://registry-1.docker.io/bitnamicharts/nginx
helm show values oci://registry-1.docker.io/bitnamicharts/nginx
helm show chart oci://registry-1.docker.io/bitnamicharts/nginx

# OCI 방식으로 직접 설치
helm install my-nginx oci://registry-1.docker.io/bitnamicharts/nginx --version 22.0.11

# 배포 확인
helm list
kubectl get deploy -owide

# 이미지 태그 확인
helm get manifest my-nginx | grep 'image:'
# image: registry-1.docker.io/bitnami/nginx:latest

# 삭제
helm uninstall my-nginx
```

### 6. 저장소에서 차트 배포 (5.5절)

#### Helm Repository 추가 및 사용

```bash
# Bitnami 저장소 추가 (기존 방식)
helm repo add bitnami https://charts.bitnami.com/bitnami

# 저장소 목록 확인
helm repo list

# 저장소 업데이트
helm repo update

# 차트 검색
helm search repo postgresql

# 특정 차트의 모든 버전 확인
helm search repo bitnami/postgresql --versions

# 차트 설치
helm install my-postgres bitnami/postgresql

# 설치 확인
kubectl get all -l app.kubernetes.io/instance=my-postgres
```

### 7. 의존성이 있는 차트 배포 (5.6절)

#### 시나리오

PostgreSQL 데이터베이스에 저장된 노래 목록을 반환하는 Java 서비스를 배포합니다. 이 서비스는 PostgreSQL에 의존합니다.

<div class="mermaid">
graph LR
    A[Music Service<br/>Java App] --> B[PostgreSQL<br/>Database]
    B --> C[(Songs<br/>Table)]

    D[Music Chart] -.-> E[PostgreSQL Chart<br/>의존성]
    E --> B
    D --> A

    style D fill:#e1f5ff
    style E fill:#fff4e1
</div>

#### Chart.yaml에 의존성 선언

```yaml
apiVersion: v2
name: music
description: A Helm chart for Music service
type: application
version: 0.1.0
appVersion: "1.0.0"
dependencies:
  - name: postgresql              # 의존성 차트 이름
    version: 18.0.17              # 차트 버전
    repository: "https://charts.bitnami.com/bitnami"  # 저장소 URL
```

#### 의존성 차트 다운로드

```bash
# 선언된 의존성 차트 다운로드
helm dependency update

# 디렉토리 구조 확인
tree
# ├── Chart.lock              # 의존성 잠금 파일
# ├── Chart.yaml
# ├── charts/                 # 의존성 차트 저장 위치
# │   └── postgresql-18.0.17.tgz
# ├── templates/
# │   ├── deployment.yaml
# │   └── service.yaml
# └── values.yaml
```

#### values.yaml에서 PostgreSQL 설정

```yaml
image:
  repository: quay.io/gitops-cookbook/music
  tag: "1.0.0"
  pullPolicy: Always
  containerPort: 8080

replicaCount: 1

# PostgreSQL 관련 설정
postgresql:
  server: jdbc:postgresql://music-db-postgresql:5432/mydb
  postgresqlUsername: my-default
  postgresqlPassword: postgres
  postgresqlDatabase: mydb
  secretName: music-db-postgresql
  secretKey: postgresql-password
```

#### deployment.yaml에서 환경 변수 설정

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ .Chart.Name }}
spec:
  replicas: {{ .Values.replicaCount }}
  selector:
    matchLabels:
      app.kubernetes.io/name: {{ .Chart.Name }}
  template:
    metadata:
      labels:
        app.kubernetes.io/name: {{ .Chart.Name }}
    spec:
      containers:
      - image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
        imagePullPolicy: {{ .Values.image.pullPolicy }}
        name: {{ .Chart.Name }}
        ports:
        - containerPort: {{ .Values.image.containerPort }}
          name: http
          protocol: TCP
        env:
        # JDBC URL 설정
        - name: QUARKUS_DATASOURCE_JDBC_URL
          value: {{ .Values.postgresql.server | default (printf "%s-postgresql" (.Release.Name)) | quote }}
        # 사용자명 설정
        - name: QUARKUS_DATASOURCE_USERNAME
          value: {{ .Values.postgresql.postgresqlUsername | default "postgres" | quote }}
        # 비밀번호는 Secret에서 가져오기
        - name: QUARKUS_DATASOURCE_PASSWORD
          valueFrom:
            secretKeyRef:
              name: {{ .Values.postgresql.secretName | default (printf "%s-postgresql" (.Release.Name)) | quote }}
              key: {{ .Values.postgresql.secretKey }}
```

#### 차트 배포 및 트러블슈팅

```bash
# 차트 설치
helm install music-db .

# 배포 확인
kubectl get sts,pod,svc,ep,secret,pv,pvc

# 문제 발생: Secret에 postgresql-password 키가 없음
# 해결 방법 1: Secret 수정
kubectl edit secret music-db-postgresql
# postgresql-password: cG9zdGdyZXMK  # base64로 인코딩된 "postgres"

# 해결 방법 2: values.yaml에서 정확한 키 이름 확인 후 수정

# 애플리케이션 로그 확인
kubectl logs -l app.kubernetes.io/name=music -f

# 서비스 테스트
kubectl port-forward service/music 8080:8080
curl -s http://localhost:8080/song

# 삭제
helm uninstall music-db
kubectl delete pvc --all
```

### 8. ConfigMap 변경 시 자동 롤링 업데이트 (5.7절)

#### 문제 상황

쿠버네티스에서 ConfigMap을 수정해도 이를 사용하는 Pod는 자동으로 재시작되지 않습니다. 따라서 애플리케이션은 이전 설정으로 계속 실행됩니다.

#### Kustomize의 해결 방법

Kustomize는 `ConfigMapGenerator`를 사용하여 ConfigMap이 수정되면 자동으로 해시 값을 메타데이터 이름에 덧붙이고, Deployment가 그 해시 값을 참조하도록 수정합니다.

#### Helm의 해결 방법

Helm은 `sha256sum` 템플릿 함수를 사용하여 ConfigMap의 SHA-256 해시를 계산하고, 이를 Pod의 annotation으로 설정합니다.

<div class="mermaid">
sequenceDiagram
    participant User
    participant ConfigMap
    participant Deployment
    participant Pod

    User->>ConfigMap: ConfigMap 내용 변경
    ConfigMap->>ConfigMap: SHA-256 해시 계산
    ConfigMap->>Deployment: annotation에 새 해시 추가
    Deployment->>Deployment: Pod 정의 변경 감지
    Deployment->>Pod: 롤링 업데이트 시작
    Pod->>Pod: 새 ConfigMap 내용 적용
</div>

#### deployment.yaml에 checksum annotation 추가

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ .Chart.Name }}
spec:
  replicas: {{ .Values.replicaCount }}
  selector:
    matchLabels:
      app.kubernetes.io/name: {{ .Chart.Name }}
  template:
    metadata:
      labels:
        app.kubernetes.io/name: {{ .Chart.Name }}
      annotations:
        # ConfigMap의 SHA-256 해시를 annotation으로 추가
        checksum/config: {{ include (print $.Template.BasePath "/configmap.yaml") . | sha256sum }}
    spec:
      containers:
      - name: {{ .Chart.Name }}
        image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
        # ...
```

#### 동작 원리

1. `include (print $.Template.BasePath "/configmap.yaml") .`: configmap.yaml 파일의 내용을 포함
2. `sha256sum`: 포함된 내용의 SHA-256 해시 계산
3. ConfigMap이 변경되면 해시값도 변경됨
4. annotation이 변경되면 Pod 정의도 변경됨
5. Pod 정의가 변경되면 Deployment가 자동으로 롤링 업데이트 시작

#### 실습 예시

```bash
# 초기 배포
helm install greeting .

# ConfigMap 확인
kubectl get configmap greeting -o yaml

# Deployment의 Pod annotation 확인
kubectl get deployment greeting -o yaml | grep checksum
#   checksum/config: abc123...

# ConfigMap 수정
kubectl edit configmap greeting

# 업그레이드 실행
helm upgrade greeting .

# 롤링 업데이트 자동 시작 확인
kubectl get pod -w

# 새 Pod의 annotation 확인
kubectl get deployment greeting -o yaml | grep checksum
#   checksum/config: def456...  # 해시값이 변경됨!
```

#### 대안: Stakater Reloader

Helm 템플릿 수정 없이 자동으로 ConfigMap/Secret 변경을 감지하여 Pod를 재시작하는 오픈소스 도구:

```bash
# Reloader 설치
helm repo add stakater https://stakater.github.io/stakater-charts
helm install reloader stakater/reloader

# Deployment에 annotation 추가
apiVersion: apps/v1
kind: Deployment
metadata:
  name: greeting
  annotations:
    reloader.stakater.com/auto: "true"  # ConfigMap/Secret 자동 감지
```

---

## 🔄 Tekton: 클라우드 네이티브 CI/CD

### 1. Tekton 소개 및 핵심 개념

#### Tekton이란?

Tekton은 쿠버네티스 기반 오픈소스 클라우드 네이티브 CI/CD 시스템입니다. 쿠버네티스 클러스터에 확장 모듈 형태로 설치되며, CI/CD 파이프라인 구축에 사용되는 CRD(Custom Resource Definition)를 제공합니다.

#### 전통적인 CI/CD vs 클라우드 네이티브 CI/CD

| 측면 | Jenkins (전통적) | Tekton (클라우드 네이티브) |
|------|------------------|--------------------------|
| **실행 환경** | VM 또는 별도 서버 | 쿠버네티스 Pod |
| **확장성** | 수평 확장 어려움 | 쿠버네티스 자동 스케일링 |
| **리소스 격리** | 제한적 | 컨테이너 레벨 격리 |
| **설정 방식** | Groovy Script | YAML (선언적) |
| **상태 관리** | 중앙 서버 | 쿠버네티스 API |
| **플러그인** | Jenkins 전용 | 컨테이너 기반 (범용) |
| **재사용성** | Job 단위 | Task/Pipeline 단위 |

#### Tekton의 핵심 구성 요소

<div class="mermaid">
graph TB
    subgraph "Tekton Pipelines"
        A[Step<br/>개별 컨테이너] --> B[Task<br/>Pod]
        B --> C[Pipeline<br/>Task들의 조합]
    end

    subgraph "실행 인스턴스"
        D[TaskRun<br/>Task 실행] --> E[PipelineRun<br/>Pipeline 실행]
    end

    subgraph "자동화"
        F[Trigger<br/>이벤트 감지] --> G[EventListener<br/>웹훅 수신]
    end

    subgraph "추가 도구"
        H[Dashboard<br/>웹 UI]
        I[CLI tkn<br/>명령줄 도구]
        J[Catalog/Hub<br/>공유 Task]
    end

    C --> E
    B --> D
    G --> E

    style B fill:#e1f5ff
    style C fill:#fff4e1
    style E fill:#e8f5e9
</div>

#### Step, Task, Pipeline 관계

<div class="mermaid">
graph LR
    subgraph Pipeline
        direction TB
        T1[Task: Build] --> T2[Task: Test]
        T2 --> T3[Task: Deploy]
    end

    subgraph Task_Build
        S1[Step: Clone] --> S2[Step: Compile]
    end

    subgraph Pod
        C1[Container: Clone] --> C2[Container: Compile]
    end

    T1 -.실행.-> Task_Build
    Task_Build -.매핑.-> Pod
</div>

#### 주요 개념

1. **Step**: Tekton의 가장 작은 단위, Pod 내의 개별 컨테이너에 대응
   - 특정 컨테이너 이미지 실행
   - 스크립트 또는 명령 수행

2. **Task**: Pod에 대응, Steps 목록을 포함
   - 재사용 가능한 빌드 블록
   - 입력(params, workspaces), 출력(results) 정의 가능

3. **Pipeline**: Tasks들의 조합
   - Tasks를 순차 또는 병렬로 실행
   - Tasks 간 데이터 공유 설정 가능

4. **TaskRun**: Task의 실행 인스턴스
   - 구체적인 파라미터 값으로 Task 실행

5. **PipelineRun**: Pipeline의 실행 인스턴스
   - 여러 TaskRun 포함

6. **Trigger**: 이벤트 감지 및 자동 실행
   - 웹훅, Git 이벤트 등에 반응

### 2. Tekton 설치 (6.1절)

#### Tekton 구성 요소 설치

```bash
# 1. Tekton Pipelines 설치 (현재 v1.5.0)
kubectl apply -f https://storage.googleapis.com/tekton-releases/pipeline/latest/release.yaml

# 설치 확인
kubectl get ns | grep tekton
# tekton-pipelines
# tekton-pipelines-resolvers

kubectl get all -n tekton-pipelines
# tekton-events-controller
# tekton-pipelines-controller
# tekton-pipelines-webhook

# 2. Tekton Triggers 설치 (현재 v0.33.0)
kubectl apply -f https://storage.googleapis.com/tekton-releases/triggers/latest/release.yaml
kubectl apply -f https://storage.googleapis.com/tekton-releases/triggers/latest/interceptors.yaml

# 설치 확인
kubectl get deploy -n tekton-pipelines | grep triggers
# tekton-triggers-controller
# tekton-triggers-core-interceptors
# tekton-triggers-webhook

# 3. Tekton Dashboard 설치 (현재 v0.62.0)
kubectl apply -f https://storage.googleapis.com/tekton-releases/dashboard/latest/release.yaml

# NodePort로 서비스 타입 변경 (포트 30000)
kubectl patch svc -n tekton-pipelines tekton-dashboard \
  -p '{"spec":{"type":"NodePort","ports":[{"port":9097,"targetPort":9097,"nodePort":30000}]}}'

# 대시보드 접속
open http://localhost:30000  # macOS
# 또는 웹 브라우저에서 http://<Node-IP>:30000

# 4. Tekton CLI 설치
# macOS
brew install tektoncd-cli

# Linux (Ubuntu/Debian)
sudo apt update
sudo apt install -y gnupg
sudo mkdir -p /etc/apt/keyrings/
sudo gpg --no-default-keyring --keyring /etc/apt/keyrings/tektoncd.gpg \
  --keyserver keyserver.ubuntu.com --recv-keys 3EFE0E0A2F2F60AA
echo "deb [signed-by=/etc/apt/keyrings/tektoncd.gpg] http://ppa.launchpad.net/tektoncd/cli/ubuntu eoan main" | \
  sudo tee /etc/apt/sources.list.d/tektoncd-ubuntu-cli.list
sudo apt update && sudo apt install -y tektoncd-cli

# 버전 확인
tkn version
# Client version: 0.42.0
# Pipeline version: v1.5.0
# Triggers version: v0.33.0
# Dashboard version: v0.62.0
```

#### CRD 확인

```bash
# Tekton 관련 CRD 확인
kubectl get crd | grep tekton
# tasks.tekton.dev
# taskruns.tekton.dev
# pipelines.tekton.dev
# pipelineruns.tekton.dev
# triggers.triggers.tekton.dev
# eventlisteners.triggers.tekton.dev
```

### 3. Hello World Task 생성 (6.2절)

#### 간단한 Task 생성

```yaml
apiVersion: tekton.dev/v1
kind: Task
metadata:
  name: hello
spec:
  steps:
  - name: echo              # Step 이름
    image: alpine           # 컨테이너 이미지
    script: |               # 실행할 스크립트
      #!/bin/sh
      echo "Hello World"
```

#### Task 배포 및 실행

```bash
# Task 생성
kubectl apply -f hello-task.yaml

# Task 목록 확인
tkn task list
kubectl get tasks

# Task 시작 (TaskRun 생성)
tkn task start --showlog hello
# TaskRun started: hello-run-722sp
# Waiting for logs to be available...
# [echo] Hello World

# Pod 확인
kubectl get pod -l tekton.dev/task=hello

# Pod 상세 정보 확인 (Init Containers와 Containers)
kubectl describe pod -l tekton.dev/task=hello
```

#### Pod 구조 이해

<div class="mermaid">
graph TB
    subgraph Pod[hello-run-722sp-pod]
        direction TB
        subgraph InitContainers[Init Containers]
            I1[prepare<br/>entrypoint 준비]
            I2[place-scripts<br/>스크립트 배치]
        end
        subgraph Containers[Containers]
            C1[step-echo<br/>실제 작업 수행]
        end
        I1 --> I2
        I2 --> C1
    end
</div>

#### 로그 확인

```bash
# 특정 컨테이너 로그 확인
kubectl logs -l tekton.dev/task=hello -c prepare
kubectl logs -l tekton.dev/task=hello -c place-scripts
kubectl logs -l tekton.dev/task=hello -c step-echo
# Hello World

# stern을 사용한 로그 확인 (추천)
kubectl stern -l tekton.dev/task=hello

# tkn으로 로그 확인
tkn task logs hello
tkn taskrun list
tkn taskrun logs hello-run-722sp
```

#### Task 상세 정보

```bash
# Task 설명
tkn task describe hello

# TaskRun 목록
tkn taskrun list
# NAME              STARTED          DURATION    STATUS
# hello-run-722sp   6 minutes ago    19s         Succeeded

# 정리
kubectl delete taskruns --all
```

#### 여러 Step을 가진 Task

```yaml
apiVersion: tekton.dev/v1
kind: Task
metadata:
  name: two-step
spec:
  steps:
  - name: echo1
    image: alpine
    script: |
      #!/bin/sh
      echo "Hello World 11111"
  - name: echo2
    image: alpine
    script: |
      #!/bin/sh
      echo "Hello World 22222"
```

```bash
# Task 실행
tkn task start --showlog two-step
# [echo1] Hello World 11111
# [echo2] Hello World 22222

# Pod 확인 (2개의 실행 컨테이너)
kubectl get pod
# NAME                    READY   STATUS      RESTARTS   AGE
# two-step-run-tt7rs-pod  0/2     Completed   0          61s

# Pod 상세 정보 (step-echo1, step-echo2 컨테이너 확인)
kubectl describe pod -l tekton.dev/task=two-step
```

### 4. Git 저장소에서 앱 빌드 (6.3절)

#### Tekton Workspace 개념

Workspace는 Task와 Step 간에 파일 시스템을 공유하는 메커니즘입니다.

<div class="mermaid">
graph LR
    subgraph Pipeline
        T1[Task: Clone] --> T2[Task: Build]
    end

    subgraph Workspace
        W[PVC<br/>공유 볼륨]
    end

    T1 --> W
    T2 --> W

    style W fill:#ffe1e1
</div>

#### Pipeline 생성

```yaml
apiVersion: tekton.dev/v1
kind: Pipeline
metadata:
  name: clone-read
spec:
  description: |
    This pipeline clones a git repo, then echoes the README file to the stout.

  # 파라미터 정의
  params:
  - name: repo-url
    type: string
    description: The git repo URL to clone from

  # 워크스페이스 정의
  workspaces:
  - name: shared-data
    description: |
      This workspace contains the cloned repo files,
      so they can be read by the next task.

  # Task 정의
  tasks:
  - name: fetch-source
    taskRef:
      name: git-clone  # Tekton Hub의 git-clone Task 사용
    workspaces:
    - name: output
      workspace: shared-data
    params:
    - name: url
      value: $(params.repo-url)
```

#### Tekton Hub에서 git-clone Task 설치

```bash
# Tekton Hub에서 git-clone Task 설치
tkn hub install task git-clone
# Task git-clone(0.9) installed in default namespace

# 설치된 Task 확인
kubectl get tasks
kubectl get tasks git-clone -o yaml | kubectl neat | yq
```

#### PipelineRun 생성 및 실행

```yaml
apiVersion: tekton.dev/v1
kind: PipelineRun
metadata:
  generateName: clone-read-run-  # 자동으로 고유 이름 생성
spec:
  pipelineRef:
    name: clone-read

  # Pod 보안 컨텍스트
  taskRunTemplate:
    podTemplate:
      securityContext:
        fsGroup: 65532

  # 워크스페이스 인스턴스화 (PVC 동적 생성)
  workspaces:
  - name: shared-data
    volumeClaimTemplate:
      spec:
        accessModes:
        - ReadWriteOnce
        resources:
          requests:
            storage: 1Gi

  # 파라미터 값 설정
  params:
  - name: repo-url
    value: https://github.com/tektoncd/website
```

#### PipelineRun 실행 및 확인

```bash
# PipelineRun 생성
kubectl create -f clone-read-pipelinerun.yaml

# 실행 상태 확인
tkn pipelinerun list
# NAME                  STARTED          DURATION    STATUS
# clone-read-run-t9dfz  1 minute ago     17s         Succeeded

# 로그 확인
tkn pipelinerun logs clone-read-run-t9dfz -f
# [fetch-source : clone] + git clone https://github.com/tektoncd/website /workspace/output
# [fetch-source : clone] Cloning into '/workspace/output'...
# [fetch-source : clone] Successfully cloned...

# PVC 확인
kubectl get pv,pvc
# PVC가 자동으로 생성되어 워크스페이스로 사용됨

# 정리
kubectl delete pipelineruns --all
kubectl delete pvc --all
```

#### Tekton Hub의 주요 Task들

| Task | 설명 |
|------|------|
| `git-clone` | Git 저장소 복제 |
| `buildah` | 컨테이너 이미지 빌드 및 푸시 |
| `kubernetes-actions` | kubectl 명령 실행 |
| `maven` | Maven 빌드 |
| `npm` | npm 빌드 |
| `helm-upgrade` | Helm 차트 배포 |
| `kaniko` | Dockerfile 기반 이미지 빌드 |

---

## 📊 2주차 학습 정리

### 1. 핵심 성취 목표

**Helm 마스터**
- ✅ Go 템플릿 기반 차트 작성 능력 습득
- ✅ values.yaml을 통한 환경별 설정 관리
- ✅ _helpers.tpl을 활용한 코드 재사용
- ✅ 차트 패키징 및 저장소 관리
- ✅ OCI Registry를 활용한 최신 차트 배포 방식 이해
- ✅ 의존성 관리 및 복잡한 애플리케이션 배포
- ✅ ConfigMap 변경 시 자동 롤링 업데이트 구현

**Tekton 기초**
- ✅ 클라우드 네이티브 CI/CD 개념 이해
- ✅ Task, Pipeline, Run 리소스 활용
- ✅ Workspace를 통한 데이터 공유
- ✅ Tekton Hub에서 재사용 가능한 Task 활용
- ✅ Git 저장소 연동 및 자동 빌드 파이프라인 구축

### 2. 실무 적용 포인트

#### Helm 활용 전략

<div class="mermaid">
graph TB
    A[개발 환경] --> B[values-dev.yaml]
    C[스테이징 환경] --> D[values-staging.yaml]
    E[프로덕션 환경] --> F[values-prod.yaml]

    G[Base Chart] --> H[helm install -f]

    B --> H
    D --> H
    F --> H

    H --> I[환경별 배포]
</div>

**환경별 설정 관리**

```bash
# 개발 환경
helm install myapp . -f values-dev.yaml

# 스테이징 환경
helm install myapp . -f values-staging.yaml

# 프로덕션 환경
helm install myapp . -f values-prod.yaml \
  --set image.tag="v1.2.3" \
  --set replicaCount=5
```

**Tekton을 활용한 GitOps 워크플로우**

1. 코드 Push → Git 웹훅 발생
2. Tekton Trigger가 웹훅 감지
3. PipelineRun 자동 생성
4. Git Clone → Build → Test → Deploy
5. Helm을 사용한 쿠버네티스 배포

### 3. 다음 단계 학습 방향

**Helm 심화**
- Helm Hooks (pre-install, post-upgrade 등)
- 차트 테스트 자동화
- Helm Secrets를 활용한 민감 정보 관리
- Umbrella Chart 패턴

**Tekton 심화**
- Tekton Triggers를 활용한 이벤트 기반 자동화
- Tekton Chains를 통한 공급망 보안
- 멀티 클러스터 배포 파이프라인
- ArgoCD와의 통합 (CI + CD)

### 4. 주요 명령어 치트시트

#### Helm 명령어

```bash
# 차트 생성 및 검증
helm create mychart
helm template .
helm lint .

# 배포 및 관리
helm install myrelease .
helm list
helm upgrade myrelease .
helm rollback myrelease 1
helm uninstall myrelease

# 정보 확인
helm get values myrelease
helm get manifest myrelease
helm history myrelease

# 저장소 관리
helm repo add bitnami https://charts.bitnami.com/bitnami
helm repo update
helm search repo nginx

# OCI Registry
helm pull oci://registry-1.docker.io/bitnamicharts/nginx
helm install myapp oci://registry-1.docker.io/bitnamicharts/nginx
```

#### Tekton 명령어

```bash
# Task 관리
tkn task list
tkn task start mytask --showlog
tkn task logs mytask
tkn task describe mytask

# Pipeline 관리
tkn pipeline list
tkn pipeline start mypipeline --showlog
tkn pipeline logs mypipeline

# Run 관리
tkn pipelinerun list
tkn pipelinerun logs myrun -f
tkn pipelinerun describe myrun

# Hub
tkn hub search
tkn hub install task git-clone
```

---

**🎉 2주차 학습 완료!**

이번 주차에서는 Helm과 Tekton의 기초를 탄탄히 다졌습니다. 이제 GitOps 워크플로우에서 패키지 관리와 CI/CD 자동화를 효과적으로 구현할 수 있는 역량을 갖추게 되었습니다.
