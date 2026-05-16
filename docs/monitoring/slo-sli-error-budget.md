---
tags:
  - Monitoring
  - SRE
  - SLO
---

# SLO / SLI / Error Budget

> 서비스 신뢰성을 정량적으로 측정하고 운영 의사결정의 기준으로 삼는 SRE의 핵심 개념이다.

---

## 개요

SLI(Service Level Indicator), SLO(Service Level Objective), Error Budget은 Google SRE에서 제안한 신뢰성 관리 프레임워크다. "시스템이 얼마나 잘 동작하는가?"를 수치로 정의하고, 그 수치를 기반으로 개발 속도와 안정성 사이의 균형을 맞춘다. 알림 피로(Alert Fatigue)를 줄이고 의미 있는 알림만 발생시키는 기반이 된다.

---

## 개념 정의

**SLI (Service Level Indicator)**: 서비스 품질을 측정하는 지표다. 좋은 요청 수 / 전체 요청 수처럼 비율로 표현하는 경우가 많다.

**SLO (Service Level Objective)**: SLI가 달성해야 하는 목표치다. "월간 99.9% 가용성"처럼 SLI의 목표 비율과 기간으로 정의한다.

**SLA (Service Level Agreement)**: SLO를 기반으로 고객과 맺는 계약이다. SLO를 위반하면 환불·크레딧 등의 패널티가 발생한다.

**Error Budget**: SLO에서 허용되는 실패 여유분이다. 99.9% SLO라면 0.1%가 Error Budget이다. 남은 Error Budget이 있으면 기능 배포를 진행하고, 소진되면 신뢰성 개선에 집중한다.

---

## 관계

```mermaid
graph TB
    SLI[SLI\n측정값: 현재 99.95% 가용성]
    SLO[SLO\n목표: 99.9% 가용성]
    EB[Error Budget\n허용 실패: 0.1%\n남은 여유: 0.05%]
    ACTION[의사결정\n배포 진행 vs 신뢰성 개선]

    SLI --> SLO
    SLO --> EB
    EB --> ACTION
```

---

## SLI 종류

**가용성 (Availability)**: 성공한 요청의 비율이다.

```
가용성 SLI = 성공 요청 수 / 전체 요청 수
```

**지연 시간 (Latency)**: 요청의 몇 퍼센트가 특정 시간 이내에 응답하는지 측정한다.

```
지연 SLI = 200ms 이내 응답 요청 수 / 전체 요청 수
```

**에러율 (Error Rate)**: 5xx 에러가 아닌 요청의 비율이다.

```
에러율 SLI = (전체 요청 - 5xx 응답) / 전체 요청
```

**포화도 (Saturation)**: CPU·메모리·큐 등 리소스의 사용률이다.

---

## Error Budget 계산

99.9% SLO를 월 기준으로 적용하면:

| 기간 | 허용 다운타임 |
|------|-------------|
| 일 | 1분 26초 |
| 주 | 10분 4초 |
| 월 | 43분 12초 |
| 연 | 8시간 41분 |

Error Budget이 남아 있으면 개발팀은 새 기능을 자유롭게 배포할 수 있다. Error Budget이 소진되면 신규 배포를 중단하고 신뢰성 개선에 집중한다.

---

## Prometheus로 SLO 측정

**가용성 SLI**:
```promql
# 5분간 성공 요청 비율
sum(rate(http_requests_total{status!~"5.."}[5m]))
/
sum(rate(http_requests_total[5m]))
```

**지연 SLI (200ms 이내 응답 비율)**:
```promql
sum(rate(http_request_duration_seconds_bucket{le="0.2"}[5m]))
/
sum(rate(http_request_duration_seconds_count[5m]))
```

**남은 Error Budget**:
```promql
# 30일 기준 남은 Error Budget 비율
1 - (
  1 - sum(rate(http_requests_total{status!~"5.."}[30d]))
      / sum(rate(http_requests_total[30d]))
) / (1 - 0.999)
```

---

## Burn Rate 기반 알림

단순 임계값 알림 대신 **Burn Rate(소진 속도)** 기반 알림을 사용하면 알림 피로를 줄일 수 있다. Burn Rate 1.0은 Error Budget을 SLO 기간(예: 30일) 안에 정확히 소진하는 속도다.

**빠른 소진 감지** (1시간 내 대응 필요):
```promql
# 1시간 Burn Rate > 14.4 → 1시간 안에 2시간치 Error Budget 소진
(
  sum(rate(http_requests_total{status=~"5.."}[1h]))
  / sum(rate(http_requests_total[1h]))
) / (1 - 0.999) > 14.4
```

**느린 소진 감지** (하루 내 대응 필요):
```promql
# 6시간 Burn Rate > 6
(
  sum(rate(http_requests_total{status=~"5.."}[6h]))
  / sum(rate(http_requests_total[6h]))
) / (1 - 0.999) > 6
```

| 알림 창 | Burn Rate 임계값 | Error Budget 소진 시점 | 심각도 |
|--------|----------------|----------------------|--------|
| 1시간 | 14.4 | 2시간 | Critical |
| 6시간 | 6 | 5시간 | Critical |
| 1일 | 3 | 10일 | Warning |
| 3일 | 1 | 30일 | Warning |

---

## Pyrra / Sloth

SLO 관리를 자동화하는 도구들이 있다. Prometheus Alerting Rule을 수동으로 작성하는 대신 SLO 선언만으로 필요한 Rule을 자동 생성한다.

**Sloth** 예시:
```yaml
apiVersion: sloth.slok.dev/v1
kind: PrometheusServiceLevel
metadata:
  name: my-service-slo
spec:
  service: my-service
  slos:
  - name: requests-availability
    objective: 99.9
    sli:
      events:
        errorQuery: sum(rate(http_requests_total{status=~"5.."}[{{.window}}]))
        totalQuery: sum(rate(http_requests_total[{{.window}}]))
    alerting:
      pageAlert:
        labels:
          severity: critical
      ticketAlert:
        labels:
          severity: warning
```

Sloth가 이 선언에서 Burn Rate 기반 Prometheus Alerting Rule과 Grafana 대시보드를 자동으로 생성한다.

---

## 참고

- [Google SRE Book - SLO 챕터](https://sre.google/sre-book/service-level-objectives/)
- [Sloth GitHub](https://github.com/slok/sloth)
- [Pyrra GitHub](https://github.com/pyrra-dev/pyrra)
- [SLO 알림 설계 가이드](https://sre.google/workbook/alerting-on-slos/)
