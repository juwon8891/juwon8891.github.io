---
tags:
  - Istio
  - Operator
---

# Istio - Sail Operator

Sail Operator는 쿠버네티스 환경에서 Istio의 설치, 업그레이드, 구성 변경을 Custom Resource 방식으로 선언형으로 관리할 수 있게 해주는 Kubernetes Operator이다. `istioctl`이나 Helm을 통한 설치 방식의 복잡함을 대체하여 GitOps 및 멀티 클러스터 환경에서 보다 간결하게 Istio를 운영할 수 있다.

---

## Sail Operator란?

**Sail Operator**는 쿠버네티스 환경에서 **Istio의 설치, 업그레이드, 구성 변경**을 **Custom Resource** 방식으로 관리할 수 있게 해주는 **Kubernetes Operator**이다.

즉, `kubectl apply -f istio.yaml` 한 줄로 Istio 전체를 선언형(Declarative)으로 설치/관리할 수 있게 해준다.

> 기존 Helm 또는 istioctl 설치 방식의 복잡함을 대체한다.

---

## 기존 방식의 문제점

| 방식        | 단점 |
|-------------|------|
| `istioctl`  | 명령어 관리 번거로움, GitOps 적용 어려움 |
| Helm chart  | values.yaml 관리 복잡, 환경 분리 어려움 |
| 수동 설치   | 자동화 불가, 실수 위험 증가 |

이런 방식은 특히 **GitOps** 기반으로 클러스터를 운영할 때 제약이 된다.

---

## Sail Operator의 장점

| 장점 | 설명 |
|------|------|
| **GitOps 친화적** | CR 형태로 선언하면 끝 |
| **istioctl/Helm 불필요** | 별도 도구 없이 구성 가능 |
| **버전 업그레이드 간편** | `version` 필드 하나로 관리 |
| **Argo CD, Kustomize 호환** | 완벽 호환 |
| **Multi-cluster 관리** | 멀티 클러스터 환경에 적합 |

---

## 설치 방법

```bash
kubectl apply -f https://raw.githubusercontent.com/sail-io/istio-sail-operator/main/deploy/install.yaml
```

Istio CR 예시:
```yaml
apiVersion: istio.sail.io/v1alpha1
kind: Istio
metadata:
  name: example-istio
spec:
  version: v1.24.0
  profile: default
  meshConfig:
    accessLogFile: /dev/stdout
  values:
    global:
      proxy:
        resources:
          requests:
            cpu: 100m
            memory: 128Mi

```

위 파일을 istio.yaml로 저장한 뒤:

```bash
kubectl apply -f istio.yaml
```

한 줄로 Istio 설치가 완료된다.

![](https://velog.velcdn.com/images/juwon8891/post/04ea695f-717a-4657-aacb-a5f42f92a6c7/image.png)

![](https://velog.velcdn.com/images/juwon8891/post/dfcd0bcd-2d38-43b2-9df9-834ef011fe08/image.png)

![](https://velog.velcdn.com/images/juwon8891/post/efb4de2c-5155-4841-a36c-ed75abcefbb6/image.png)

## 권장 사용 환경

- GitOps(Argo CD 등) 기반으로 쿠버네티스를 운영하는 팀
- Istio를 프로덕션 환경에서 반복적으로 관리해야 하는 경우
- Helm/istioctl 없이 간결한 구성을 원하는 경우
- Multi-cluster나 Multi-tenant 환경 운영 중


Sail Operator는 YAML만으로 Istio를 설치, 구성, 업그레이드할 수 있는 선언형 솔루션이다. GitOps, Argo CD, Kustomize 기반으로 인프라를 운영한다면 도입을 검토할 만한 도구이다.
