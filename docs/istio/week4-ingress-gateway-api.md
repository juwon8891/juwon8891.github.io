---
tags:
  - Istio
  - Gateway API
---

# Istio Ingress Gateway를 Kubernetes Gateway API로 구성하고 사용하기

> Kubernetes Gateway API를 활용한 Istio Ingress Gateway 구성 방법과 HTTPRoute 설정을 정리한다.

## 개요
Istio Ingress Gateway는 외부 트래픽을 클러스터 내부의 서비스로 라우팅하는 핵심 컴포넌트이다. Kubernetes Gateway API는 Kubernetes 환경에서 표준화된 방식으로 트래픽 관리를 지원하며, Istio 역시 Gateway API를 지원하여 더욱 간결하고 강력한 트래픽 관리 기능을 제공한다.

이번 글에서는 Istio와 Gateway API를 사용하여 Ingress Gateway를 설정하고 테스트하는 실습 환경을 구성해 보겠다.

---

## 1. 사전 준비사항

### Kubernetes 클러스터 구성

실습을 위해 kind와, Istio는 이미 설치해있다고 가정하고 진행하겠다.

---

## 2. Gateway API 설치

Kubernetes Gateway API의 CRD를 클러스터에 설치한다.

```bash
kubectl apply -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.0.0/standard-install.yaml
```

설치 후 CRD가 제대로 설치되었는지 확인한다.

```bash
kubectl get crd gateways.gateway.networking.k8s.io
```

---

## 3. Istio Gateway 설정

Gateway API를 통해 Istio Ingress Gateway를 구성한다.

### Gateway 리소스 생성

아래의 Gateway 리소스를 정의하여 Istio Ingress Gateway를 설정한다.

```yaml
# gateway.yaml
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: istio-gateway
spec:
  gatewayClassName: istio
  listeners:
  - name: http
    protocol: HTTP
    port: 80
```

```bash
kubectl apply -f gateway.yaml
```

### HTTPRoute 설정

Gateway와 연결할 HTTPRoute를 설정하여 트래픽을 서비스로 라우팅한다.

```yaml
# httproute.yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: http-route
  namespace: default
spec:
  parentRefs:
  - name: istio-gateway
  rules:
  - matches:
    - path:
        type: PathPrefix
        value: /
    backendRefs:
    - name: nginx-service
      port: 80
```

```bash
kubectl apply -f httproute.yaml
```
원활한 라우팅을 위해 NodePort 타입으로 변경한다.
```bash
kubectl annotate gateway istio-gateway networking.istio.io/service-type=NodePort --overwrite
kubectl patch svc istio-gateway-istio -p '{"spec": {"type": "NodePort", "ports": [{"port": 80, "targetPort": 80, "nodePort": 30001}]}}'
```

---

## 4. 샘플 애플리케이션 배포 및 테스트

테스트를 위해 간단한 애플리케이션을 배포한다.

```bash
kubectl create deployment nginx-service --image=nginx
kubectl expose deployment nginx-service --port=80
```

Istio Ingress Gateway의 IP를 확인한다.

```bash
kubectl get svc -n istio-system istio-ingressgateway
```

Ingress Gateway로 접근하여 정상적으로 라우팅되는지 확인한다.

```bash
curl localhost:30001
```
![](https://velog.velcdn.com/images/juwon8891/post/245c6fd9-6554-49fb-909d-e4bd67286d08/image.png)

---

## 마무리 {: .no-toc }

본 실습을 통해 Istio와 Kubernetes Gateway API를 사용하여 Ingress Gateway를 설정하고 라우팅하는 방법을 확인했다. Gateway API는 Kubernetes 생태계에서 표준화된 Ingress 방식으로 자리잡고 있으며, 이 구조를 이해하고 활용하면 클라우드 네이티브 환경에서 효과적으로 트래픽을 관리할 수 있다.

