# juwon8891.github.io

주차별 학습 내용 정리 블로그

## 📁 구조

```
juwon8891.github.io/
├── _config.yml       # Jekyll 설정
├── index.md          # 메인 페이지
├── _posts/           # 블로그 포스트 (마크다운)
│   └── YYYY-MM-DD-title.md
└── README.md
```

## 📝 새 글 작성 방법

1. `_posts/` 디렉토리에 파일 생성
2. 파일명 형식: `YYYY-MM-DD-제목.md` (예: `2025-10-14-week1-image-build.md`)
3. Front matter 추가:
   ```yaml
   ---
   layout: post
   title: "포스트 제목"
   date: YYYY-MM-DD
   categories: [카테고리1, 카테고리2]
   ---
   ```
4. 본문 작성 (마크다운 형식)

## 🚀 배포

GitHub에 push하면 자동으로 GitHub Pages에 배포됩니다.

```bash
git add .
git commit -m "Add new post"
git push origin main
```

## 🔗 URL

https://juwon8891.github.io
