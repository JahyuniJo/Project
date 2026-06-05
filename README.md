# DH.story — Nền Tảng Đọc Truyện Trực Tuyến

Website đọc truyện trực tuyến tích hợp AI và tìm kiếm toàn văn, xây dựng cho Đồ Án Tốt Nghiệp. Hệ thống thu thập (crawl) truyện từ nguồn bên ngoài, tìm kiếm nhanh qua Elasticsearch, tóm tắt nội dung bằng AI (Groq), gợi ý truyện theo lịch sử đọc, và tương tác thời gian thực qua Socket.io.

---

## Tính năng nổi bật

- **Tìm kiếm toàn văn** — Elasticsearch với 3 cấp độ fallback: `match_phrase` → `fuzzy` → SQL `ILIKE`
- **Autocomplete** — Gợi ý tên truyện theo từng ký tự gõ
- **Tóm tắt AI** — Groq API (`llama-3.1-8b-instant`) tóm tắt nội dung truyện, cache kết quả vào DB
- **Gợi ý truyện** — Dựa trên lịch sử đọc, chấm điểm theo thể loại (35%) + lượt xem (20%) + rating (15%)
- **Thông báo realtime** — Socket.io: reply comment, like, admin phản hồi báo lỗi
- **Hệ thống comment** — Cây comment đa cấp, like, reply
- **Danh sách yêu thích** — Tạo nhiều list, thêm/xóa truyện tự do
- **Đánh giá** — Rating 1–5 sao mỗi truyện
- **Báo lỗi truyện** — Gửi kèm ảnh chụp màn hình, admin theo dõi và phản hồi
- **Quản trị admin** — Quản lý user (thêm, sửa, xóa, khóa tài khoản có thời hạn), thống kê, quản lý báo lỗi
- **Crawl truyện** — Tự động thu thập từ nguồn ngoài bằng Axios + Cheerio
- **Xác thực OTP** — Quên/đặt lại mật khẩu qua email

---

## Stack công nghệ

| Layer | Công nghệ |
|---|---|
| Backend | Node.js, Express v5 |
| Database | PostgreSQL |
| Search | Elasticsearch (SQL fallback) |
| AI | Groq API — `llama-3.1-8b-instant` |
| Realtime | Socket.io |
| Crawler | Axios + Cheerio |
| Frontend | Vanilla HTML + CSS + JavaScript, Tailwind CSS |
| Auth | JWT trong HTTP-only cookie |
| ORM | `pg` Pool (queries) + Sequelize (model schema) |
| Container | Docker + Docker Compose |

---

## Cài đặt & Chạy dự án

### Yêu cầu

- Node.js >= 18
- PostgreSQL >= 14
- Elasticsearch >= 8

### Cách 1 — Docker Compose (khuyên dùng)

```bash
# Clone repo
git clone <repo-url>
cd Project

# Copy và điền biến môi trường
cp .env.example .env

# Khởi động toàn bộ hệ thống
docker compose up -d
```

Ứng dụng chạy tại `http://localhost:3000`.

### Cách 2 — Chạy thủ công

```bash
# Cài dependencies
npm install

# Khởi động server
npm start          # nodemon → node backend/app.js

# Khởi tạo Elasticsearch (chạy một lần)
cd backend
npm run es:create-index
npm run es:sync    # Sync dữ liệu PostgreSQL → Elasticsearch
```

---

## Biến môi trường

Tạo file `.env` ở thư mục gốc (xem mẫu tại [`.env.example`](.env.example)):

```env
# PostgreSQL
DB_NAME=story_db
DB_USER=story_user
DB_PASS=
DB_HOST=localhost
DB_PORT=5432

# Elasticsearch
ELASTICSEARCH_URL=http://localhost:9200
ELASTICSEARCH_STORIES_INDEX=stories
ELASTICSEARCH_USERNAME=elastic
ELASTICSEARCH_PASSWORD=

# JWT
JWT_SECRET=

# Groq AI
GROQ_API_KEY=

# Email (Gmail App Password — dùng cho OTP)
EMAIL_USER=
EMAIL_PASS=

# OpenAI (embedding — tuỳ chọn)
OPENAI_KEY=
```

---

## Cấu trúc thư mục

```
Project/
├── backend/
│   ├── app.js                  # Entry point: HTTP, Socket.io, routes
│   ├── config/
│   │   ├── pool.js             # pg Pool — queries trực tiếp
│   │   ├── db.js               # Sequelize — model ORM
│   │   └── elasticsearch.js    # Elasticsearch client
│   ├── controllers/            # authController, storyController
│   ├── crawlers/               # Axios + Cheerio crawlers
│   ├── middleware/             # authMiddleware, requireAdmin, optionalAuth
│   ├── models/                 # Sequelize models
│   ├── routes/                 # Tất cả API routes
│   ├── services/               # aiService, searchService, embedding
│   └── utils/                  # createIndex, syncSQL, normalizeText
├── frontend/
│   ├── pages/
│   │   ├── public/             # index, login, register, read, forgot/reset-password
│   │   └── private/            # index2, admin, info, stories, user, read2, fav, stat, reports
│   ├── assets/
│   │   ├── images/             # Logo, favicon
│   │   └── js/                 # JS theo từng trang
│   └── components/             # alertModal
├── docker-compose.yml
├── .env.example
└── package.json
```

---

## API Overview

### Xác thực & Người dùng

| Method | Endpoint | Mô tả | Auth |
|---|---|---|---|
| POST | `/api/users/register` | Đăng ký | — |
| POST | `/api/users/login` | Đăng nhập | — |
| GET | `/api/users/logout` | Đăng xuất | — |
| GET | `/api/users/info` | Thông tin cá nhân | User |
| POST | `/api/users/upload-avatar` | Upload avatar | User |
| POST | `/api/auth/forgot-password` | Gửi OTP email | — |
| POST | `/api/auth/verify-otp` | Xác nhận OTP | — |
| POST | `/api/auth/reset-password` | Đặt lại mật khẩu | — |
| POST | `/api/auth/change-password` | Đổi mật khẩu | User |

### Truyện

| Method | Endpoint | Mô tả | Auth |
|---|---|---|---|
| GET | `/api/stories` | Danh sách + tìm kiếm | — |
| GET | `/api/stories/search` | Autocomplete suggest | — |
| GET | `/api/stories/by-genre` | Lọc theo thể loại | — |
| GET | `/api/stories/:id` | Chi tiết truyện | — |
| PUT | `/api/stories/:id` | Sửa truyện | User |
| DELETE | `/api/stories/:id` | Xóa truyện | User |
| POST | `/api/stories/:id/view` | Ghi lịch sử xem | User |
| POST | `/api/stories/sync` | Crawl + sync ES | User |

### Tương tác

| Method | Endpoint | Mô tả | Auth |
|---|---|---|---|
| POST | `/api/ai/summarize` | Tóm tắt bằng Groq AI | — |
| GET | `/api/recommend` | Gợi ý truyện | User |
| GET/POST | `/api/comments` | Lấy / Tạo comment | Optional / User |
| POST | `/api/comments/like` | Like/unlike comment | User |
| GET/POST | `/api/rating` | Rating truyện (1–5) | — / User |
| GET/POST | `/api/favlists` | Danh sách yêu thích | User |
| POST | `/api/report` | Gửi báo lỗi | — |

### Admin

| Method | Endpoint | Mô tả |
|---|---|---|
| GET | `/api/stat` | Thống kê tổng quan |
| GET | `/api/stat/popular-week` | Truyện hot tuần |
| GET/POST/PUT/DELETE | `/api/usercontroll` | Quản lý user |
| PATCH | `/api/usercontroll/:id/lock` | Khóa / mở khóa tài khoản |
| GET | `/api/admin/reports` | Danh sách báo lỗi |
| POST | `/api/admin/reports/:id/respond` | Phản hồi báo lỗi |

---

## Phân quyền trang

| URL | Quyền |
|---|---|
| `/`, `/login.html`, `/register.html`, `/read.html` | Tất cả |
| `/index2.html`, `/info.html` | Đăng nhập |
| `/read2.html`, `/fav.html`, `/error-report.html` | Role: `user` |
| `/admin.html`, `/stories.html`, `/user.html`, `/stat.html`, `/admin-report.html` | Role: `admin` |

---

## Database Schema

```
stories          — id, title, author, description, genres[], status, view_count, ai_summary
chapters         — id, story_id (FK), chapter_num (float8), title, source_url
chapter_contents — chapter_id (PK+FK), images (jsonb)
users            — id, email, username, password, role, avatar_url, locked_until
comments         — id, story_id, user_id, parent_id, content, likes
ratings          — story_id, user_id, rating  [UNIQUE]
user_story_views — user_id, story_id, viewed_at
favorite_lists   — id, iduser, name
favorite_stories — list_id, story_id  [UNIQUE]
notifications    — id, user_email, message, is_read
reports          — id, title, story_url, message, screenshot_path, status, response
```

Quan hệ chapters:

```
stories (1) ──< chapters (N) ──── chapter_contents (1)
               CASCADE DELETE       CASCADE DELETE
```

---

## Tính năng đang phát triển

- [ ] Chatbot realtime (nhân vật ảo qua Socket.io + Groq)
- [ ] Semantic search nâng cao bằng embedding
- [ ] Pagination cho comments
- [ ] Trang đọc truyện tranh theo chương
- [ ] Crawl trang JavaScript-rendered bằng Puppeteer

---

## Tác giả

**Dieu Hoang** — Đồ Án Tốt Nghiệp 2025
