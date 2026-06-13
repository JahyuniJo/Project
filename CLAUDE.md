# CLAUDE.md — Đồ Án Tốt Nghiệp: Nền Tảng Đọc Truyện Trực Tuyến

## Tổng quan dự án

Website đọc truyện trực tuyến tích hợp AI và tìm kiếm toàn văn, xây dựng cho Đồ Án Tốt Nghiệp. Hệ thống thu thập (crawl) truyện từ nguồn bên ngoài, tìm kiếm nhanh qua Elasticsearch, tóm tắt nội dung bằng AI (Groq), gợi ý truyện theo lịch sử đọc, và tương tác thời gian thực qua Socket.io.

---

## Kiến trúc hệ thống

**Monorepo**: Backend Express phục vụ luôn các file HTML tĩnh của frontend.

```
Project/
├── backend/
│   ├── app.js                  # Entry point: HTTP, Socket.io, routes, static serving
│   ├── config/
│   │   ├── pool.js             # pg Pool — dùng cho tất cả query trực tiếp
│   │   ├── db.js               # Sequelize — chỉ dùng cho model ORM
│   │   └── elasticsearch.js    # Elasticsearch client
│   ├── controllers/
│   │   ├── authController.js   # Forgot/reset/change password, OTP qua email
│   │   └── storyController.js  # Crawl trigger, search suggest
│   ├── crawlers/
│   │   ├── crawler.js          # Axios + Cheerio (trang tĩnh)
│   │   ├── crawlALL.js         # Axios + Cheerio (batch crawl)
│   │   └── crawlChapterList.js # Crawl danh sách chương + ảnh (Axios + Cheerio, Puppeteer fallback)
│   ├── middleware/
│   │   ├── authMiddleware.js   # Bắt buộc đăng nhập (JWT cookie)
│   │   └── optionalAuth.js     # Không bắt buộc (dùng cho comments)
│   ├── models/
│   │   └── Story.js            # Sequelize model (định nghĩa schema)
│   ├── routes/
│   │   ├── aiRoutes.js         # POST /api/ai/summarize
│   │   ├── auth.js             # GET /api/import/me
│   │   ├── commentRoutes.js    # CRUD comments + like + reply
│   │   ├── interaction.js      # Favorite lists + stories
│   │   ├── ratingRoutes.js     # GET/POST rating
│   │   ├── recommendRoutes.js  # GET gợi ý truyện
│   │   ├── report.js           # Báo lỗi + notifications (nhận io)
│   │   ├── statRoutes.js       # Thống kê admin + popular-week
│   │   ├── chapterRoutes.js    # GET /api/chapters/:id/content (lazy crawl + cache)
│   │   ├── chatRoutes.js       # Socket.io chatMessage + GET/DELETE /api/chat/history
│   │   ├── storyRoutes.js      # CRUD truyện + search + view
│   │   ├── usercontrollRoutes.js # Admin quản lý user
│   │   └── userRoutes.js       # Register, login, logout, info, upload avatar
│   ├── services/
│   │   ├── aiService.js        # callAI() + callAIStream() — Groq API
│   │   ├── searchService.js    # Elasticsearch + SQL fallback
│   │   └── embedding.js        # OpenAI embeddings (tuỳ chọn)
│   └── utils/
│       ├── createIndex.js      # Script tạo ES index
│       ├── syncSQL.js          # Script sync PostgreSQL → Elasticsearch
│       ├── normalizeText.js    # removeVietnameseTones()
│       ├── validators.js       # Hằng số validate dùng chung (EMAIL_REGEX, MIN_PASSWORD_LENGTH)
│       └── createChatTables.js # Migration script: bảng chat_messages + index
├── frontend/
│   ├── pages/
│   │   ├── public/             # index, login, register, read, forgot/reset-password
│   │   └── private/            # index2, admin, info, stories, user, read2, fav, stat, reports
│   ├── assets/
│   │   ├── images/             # Logo, favicon
│   │   └── js/                 # comments.js, chat.js và các file JS theo trang
│   └── components/             # alertModal.html, alertModal.js
├── .env.example                # Template biến môi trường
├── nodemon.json                # Dev watcher
└── package.json
```

---

## Stack công nghệ

| Layer | Công nghệ |
|---|---|
| Backend | Node.js, Express v5 |
| Database | PostgreSQL |
| Search | Elasticsearch (với SQL fallback) |
| AI | **Groq API** — model `llama-3.1-8b-instant` |
| Realtime | Socket.io |
| Crawler | Axios + Cheerio + Puppeteer (fallback cho trang yêu cầu JS) |
| Frontend | **Vanilla HTML + CSS + JavaScript** |
| Auth | JWT trong HTTP-only cookie (`authToken`) |
| ORM | `pg` Pool (queries) + Sequelize (model schema) |

---

## Cách chạy dự án

```bash
# Server (từ thư mục gốc)
npm start          # nodemon → node backend/app.js — http://localhost:3000

# Elasticsearch (từ backend/)
cd backend
npm run es:create-index   # Tạo index
npm run es:sync           # Sync dữ liệu PostgreSQL → Elasticsearch
```

**Yêu cầu:** PostgreSQL tại `localhost:5432`, Elasticsearch tại `localhost:9200`.

---

## Biến môi trường (`.env`)

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

File `.env` đặt ở **thư mục gốc** (`Project/.env`). Backend load với path `../`.

---

## Kết nối Database

Dự án dùng **hai module riêng biệt**:

| File | Dùng cho | Import |
|---|---|---|
| `config/pool.js` | Tất cả SQL query trong routes/services | `require('../config/pool')` |
| `config/db.js` | Sequelize ORM (model định nghĩa) | `require('../config/db')` |

**Không bao giờ** dùng `config/db` để query trực tiếp. Không bao giờ hardcode credentials.
**Tất cả** các confirm đều có popup cảnh báo, xác nhận không bao giờ để localhost3001:says
---

## API Routes

| Method | Path | Mô tả | Auth |
|---|---|---|---|
| POST | `/api/users/register` | Đăng ký | Không |
| POST | `/api/users/login` | Đăng nhập | Không |
| GET | `/api/users/logout` | Đăng xuất | Không |
| GET | `/api/users/info` | Thông tin cá nhân | User |
| POST | `/api/users/upload-avatar` | Upload avatar | User |
| POST | `/api/auth/forgot-password` | Gửi OTP email | Không |
| POST | `/api/auth/verify-otp` | Xác nhận OTP | Không |
| POST | `/api/auth/reset-password` | Đặt lại mật khẩu | Không |
| POST | `/api/auth/change-password` | Đổi mật khẩu | User |
| GET | `/api/import/me` | Lấy thông tin từ JWT | User |
| GET | `/api/stories` | Danh sách + tìm kiếm (ES + fallback) | Không |
| GET | `/api/stories/search` | Autocomplete suggest | Không |
| GET | `/api/stories/by-genre` | Lọc theo thể loại | Không |
| GET | `/api/stories/:id` | Chi tiết truyện | Không |
| PUT | `/api/stories/:id` | Sửa truyện | User |
| DELETE | `/api/stories/:id` | Xóa truyện | User |
| POST | `/api/stories/:id/view` | Ghi lịch sử xem | User |
| POST | `/api/stories/sync` | Crawl + sync ES | User |
| GET | `/api/chapters/:id/content` | Lấy ảnh chương (lazy crawl + cache DB) | Không |
| GET | `/api/chat/history?story_id=N` | Lịch sử chat (50 tin gần nhất) | User |
| DELETE | `/api/chat/history?story_id=N` | Xóa lịch sử chat theo truyện | User |
| POST | `/api/ai/summarize` | Tóm tắt bằng Groq AI | Không |
| GET | `/api/recommend` | Gợi ý truyện | User |
| GET | `/api/comments` | Lấy comments (cây) | Optional |
| POST | `/api/comments` | Tạo comment | User |
| POST | `/api/comments/reply` | Reply comment | User |
| PUT | `/api/comments` | Sửa comment | User |
| DELETE | `/api/comments` | Xóa comment (+ replies) | User |
| POST | `/api/comments/like` | Like/unlike comment | User |
| GET | `/api/favlists` | Danh sách yêu thích | User |
| POST | `/api/favlists` | Tạo danh sách | User |
| DELETE | `/api/favlists/:id` | Xóa danh sách | User |
| GET | `/api/favlists/:id/stories` | Truyện trong danh sách | User |
| POST | `/api/favlists/:id/stories` | Thêm truyện vào danh sách | User |
| DELETE | `/api/favlists/:listId/stories/:storyId` | Xóa truyện khỏi danh sách | User |
| GET | `/api/rating` | Rating trung bình | Không |
| POST | `/api/rating` | Đánh giá truyện (1-5) | User |
| GET | `/api/stat` | Thống kê tổng quan | **Admin** |
| GET | `/api/stat/popular-week` | Truyện hot tuần | Không |
| POST | `/api/report` | Gửi báo lỗi | Không |
| GET | `/api/admin/reports` | Danh sách báo lỗi | **Admin** |
| POST | `/api/admin/reports/:id/respond` | Phản hồi báo lỗi | **Admin** |
| GET | `/api/notifications` | Thông báo của user | Không |
| PUT | `/api/notifications/:id/read` | Đánh dấu đã đọc | Không |
| GET | `/api/usercontroll` | Danh sách users | **Admin** |
| POST | `/api/usercontroll` | Thêm user | **Admin** |
| PUT | `/api/usercontroll/:id` | Sửa user | **Admin** |
| DELETE | `/api/usercontroll/:id` | Xóa user | **Admin** |

---

## HTML Pages & Bảo vệ route

| URL | File | Quyền |
|---|---|---|
| `/` | `public/index.html` | Tất cả |
| `/login.html` | `public/login.html` | Tất cả |
| `/register.html` | `public/register.html` | Tất cả |
| `/read.html` | `public/read.html` | Tất cả |
| `/index2.html` | `private/index2.html` | Đăng nhập |
| `/info.html` | `private/info.html` | Đăng nhập |
| `/read2.html` | `private/read2.html` | Role: `user` hoặc `admin` |
| `/fav.html` | `private/fav.html` | Role: `user` |
| `/error-report.html` | `private/error-report.html` | Role: `user` |
| `/admin.html` | `private/admin.html` | Role: `admin` |
| `/stories.html` | `private/stories.html` | Role: `admin` |
| `/user.html` | `private/user.html` | Role: `admin` |
| `/stat.html` | `private/stat.html` | Role: `admin` |
| `/admin-report.html` | `private/admin-report.html` | Role: `admin` |

---

## Tính năng AI & Search

### Chatbot trợ lý truyện (Groq API + Socket.io)
- Widget nổi (floating, bottom-right) trên `read2.html` và `chapter.html`
- Bắt buộc đăng nhập; lịch sử lưu vào bảng `chat_messages` (PostgreSQL)
- Streaming qua Socket.io: client emit `chatMessage` → server emit từng `chatChunk` → `chatDone`
- System prompt tự động nhúng context truyện (title, author, genres, description, ai_summary)
- Cooldown 2 giây per socket để tránh spam
- Lịch sử 20 tin gần nhất được đưa vào context mỗi lần gọi AI
- File: [backend/routes/chatRoutes.js](backend/routes/chatRoutes.js), [frontend/assets/js/chat.js](frontend/assets/js/chat.js)

### Tóm tắt truyện (Groq API)
- `POST /api/ai/summarize` với `{ story_id }`
- Nếu `ai_summary` đã tồn tại trong DB → trả về ngay, không gọi lại AI
- Model: `llama-3.1-8b-instant`, temperature 0.3
- File: [backend/services/aiService.js](backend/services/aiService.js)

### Tìm kiếm (Elasticsearch + fallback)
- Ưu tiên: `match_phrase` → `multi_match + fuzzy` → SQL ILIKE
- Suggest (autocomplete): `match_phrase_prefix` + `multi_match bool_prefix`
- File: [backend/services/searchService.js](backend/services/searchService.js)

### Gợi ý truyện
- Dựa trên genres từ lịch sử xem (`user_story_views`)
- Scoring: genre match (35%) + view_count (20%) + avg_rating (15%)
- File: [backend/routes/recommendRoutes.js](backend/routes/recommendRoutes.js)

### Realtime (Socket.io)
- User join room theo email: `socket.emit("registerEmail", email)`
- Server emit: `io.to(email).emit("newNotification", { ... })`
- Dùng khi: reply comment, like comment, admin phản hồi báo lỗi

---

## Database Schema (PostgreSQL)

- `stories` — id, title, author, description, url, cover_url, genres(text[]), status, view_count, ai_summary, created_at
- `chapters` — id, story_id (FK→stories CASCADE), chapter_num(float8), title, source_url, created_at. UNIQUE(story_id, chapter_num)
- `chapter_contents` — chapter_id (PK, FK→chapters CASCADE), images(jsonb), crawled_at. 1-1 với chapters, lưu danh sách URL ảnh của chương
- `users` — id, email(UNIQUE), username, password, role, avatar_url, otp, otp_expires
- `comments` — id, story_id, user_id, parent_id, content, likes, created_at, updated_at
- `comment_likes` — id, user_id, comment_id. UNIQUE(user_id, comment_id)
- `ratings` — id, story_id, user_id, rating. UNIQUE(story_id, user_id)
- `user_story_views` — id, user_id, story_id, viewed_at
- `notifications` — id, user_email, message, is_read, created_at
- `favorite_lists` — id, iduser, name, created_at
- `favorite_stories` — id, list_id, story_id, added_at. UNIQUE(list_id, story_id)
- `reports` — id, title, story_url, message, screenshot_path, user_email, status(pending/fixing/done/ignored), response, created_at, updated_at
- `chat_messages` — id, user_id (FK→users CASCADE), story_id (FK→stories CASCADE), role(user/assistant), content, created_at

### Quan hệ chapters

```
stories (1) ──< chapters (N) ──── chapter_contents (1)
               story_id FK          chapter_id PK+FK
               CASCADE DELETE       CASCADE DELETE
```

- Mỗi `chapter_contents` chứa `images: ["url1", "url2", ...]` — danh sách ảnh của chương đó (truyện tranh)
- Crawl chương: lưu metadata vào `chapters`, lưu ảnh vào `chapter_contents`
- `chapter_num` dùng `float8` để hỗ trợ chương thập phân (vd: 10.5)

---

## Database Indexes (PostgreSQL)

Các index hiện có và lý do tồn tại:

| Bảng | Index | Loại | Lý do |
|---|---|---|---|
| `stories` | `stories_pkey` | UNIQUE btree(id) | PK |
| `stories` | `unique_story_title` | UNIQUE btree(title) | Tránh trùng tên khi crawl |
| `stories` | `idx_stories_genres` | GIN(genres) | Query `ANY(genres)` và filter thể loại |
| `stories` | `idx_stories_created_at` | btree(created_at DESC) | Sort "Truyện mới nhất" |
| `chapters` | `chapters_pkey` | UNIQUE btree(id) | PK |
| `chapters` | `chapters_story_id_chapter_num_key` | UNIQUE btree(story_id, chapter_num) | Tránh trùng chương, đồng thời index cho `WHERE story_id=?` |
| `chapter_contents` | `chapter_contents_pkey` | UNIQUE btree(chapter_id) | PK + FK lookup |
| `users` | `users_pkey` | UNIQUE btree(id) | PK |
| `users` | `users_email_key` | UNIQUE btree(email) | Login lookup |
| `comments` | `comments_pkey` | UNIQUE btree(id) | PK |
| `comments` | `idx_comments_story_id` | btree(story_id) | `WHERE story_id=?` mỗi lần load comments |
| `comments` | `idx_comments_parent_id` | btree(parent_id) WHERE NOT NULL | Build comment tree, CTE xóa thread |
| `comment_likes` | `comment_likes_pkey` | UNIQUE btree(id) | PK |
| `comment_likes` | `comment_likes_user_id_comment_id_key` | UNIQUE btree(user_id, comment_id) | Upsert like, check trùng |
| `ratings` | `ratings_pkey` | UNIQUE btree(id) | PK |
| `ratings` | `unique_rating` | UNIQUE btree(story_id, user_id) | 1 user 1 rating / truyện |
| `user_story_views` | `user_story_views_pkey` | UNIQUE btree(id) | PK |
| `user_story_views` | `idx_viewed_at` | btree(viewed_at) | Filter 7 ngày gần nhất |
| `user_story_views` | `idx_user_story_views_user_id` | btree(user_id) | Gợi ý truyện, lịch sử đọc |
| `user_story_views` | `idx_user_story_views_story_viewed` | btree(story_id, viewed_at) | Popular-week: GROUP BY story_id + filter viewed_at |
| `notifications` | `notifications_pkey` | UNIQUE btree(id) | PK |
| `notifications` | `idx_notifications_user_email` | btree(user_email) | `WHERE user_email=?` mỗi lần load bell |
| `favorite_lists` | `favorite_lists_pkey` | UNIQUE btree(id) | PK |
| `favorite_lists` | `idx_favorite_lists_iduser` | btree(iduser) | `WHERE iduser=?` mỗi lần vào trang Yêu thích |
| `favorite_stories` | `favorite_stories_pkey` | UNIQUE btree(id) | PK |
| `favorite_stories` | `favorite_stories_list_id_story_id_key` | UNIQUE btree(list_id, story_id) | Tránh trùng, lookup theo list |
| `reports` | `reports_pkey` | UNIQUE btree(id) | PK |
| `reports` | `idx_reports_status` | btree(status) | Filter pending, admin dashboard count |
| `reports` | `idx_reports_user_email` | btree(user_email) | `WHERE user_email=?` lịch sử báo lỗi user |

---

## Quy tắc phát triển

### Bảo mật & Cấu hình

- **Không hardcode credentials** — Tất cả đọc từ `process.env`. Không commit giá trị nhạy cảm.
- **Không lộ `error.message` ra client** — Dùng message chung `"Lỗi server, vui lòng thử lại"`. Stack trace chỉ in ở `console.error` phía server.
- **Admin routes phải có middleware** — API admin dùng `authMiddleware` + `requireAdmin`. HTML admin dùng `authenticateHTML(['admin'])`.

### Tổ chức code

- **`config/pool.js` cho queries, `config/db.js` cho ORM** — Không dùng lẫn. Không bao giờ có hai `module.exports` trong một file.
- **Route chỉ điều phối** — Validate input → gọi service/query → trả response. Logic nghiệp vụ thuộc về `services/`.
- **Frontend JS theo trang** — Mỗi trang có file JS riêng trong `frontend/assets/js/`. Dùng `const`/`let`, không dùng `var`.

### Xử lý lỗi

- **`try/catch` + `finally` khi lấy pg client** — Luôn `client.release()` trong `finally`.
- **Format response nhất quán**:
  - Thành công: `{ message, data }` hoặc chỉ `{ data }` khi không cần message
  - Lỗi: `{ message }`
  - Tạo mới: status `201`
- **HTTP status code đúng nghĩa** — `400` lỗi input, `401` chưa đăng nhập, `403` không đủ quyền, `404` không tìm thấy, `500` lỗi server.

### Validate input

- **Validate tại route boundary** — Kiểm tra field tồn tại, đúng kiểu, đúng giới hạn trước khi chạm DB.
- **Email**: regex `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`
- **Password**: tối thiểu 6 ký tự
- **Rating**: phải là số nguyên từ 1 đến 5
- **ID params**: parse `parseInt`, kiểm tra `> 0`
- **Parameterized query bắt buộc** — Luôn dùng `$1, $2, ...`. Không nối chuỗi SQL.

### Logging

- **Format**: `console.error("[tênFile] context:", err)` — luôn có module prefix.
- **Không `console.log` trong production path** — Chỉ dùng tạm khi debug, xóa trước khi commit.

### Phong cách code

- **Tên biến/hàm camelCase, tên bảng/cột snake_case**
- **Thông báo lỗi tiếng Việt có dấu** — Không dùng "Loi", "khong tim thay".
- **Không comment giải thích WHAT** — Chỉ comment khi WHY không hiển nhiên.
- **Sync Elasticsearch** sau mỗi CREATE/UPDATE/DELETE truyện — gọi `indexStory()` / `deleteStory()` từ `searchService.js`.

---

## Định hướng deploy — Luôn phát triển sẵn sàng production

Mọi tính năng và thay đổi phải được viết theo hướng có thể deploy ngay, không cần sửa lại khi lên production.

### Hạ tầng

- **Infrastructure-as-Code** — Mọi service (Elasticsearch, PostgreSQL) đều phải khai báo trong `docker-compose.yml`. Không phụ thuộc vào bất kỳ file `.bat`, service thủ công, hay cài đặt cục bộ nào.
- **Biến môi trường tách biệt** — Dev và production chỉ khác nhau ở file `.env`. Code không được hard-code bất kỳ giá trị nào liên quan đến môi trường (host, port, secret, URL).
- **Stateless app** — Server không lưu trạng thái trong bộ nhớ qua các request. Session, file upload, cache phải được lưu ra ngoài (DB, volume, object storage).

### Port & Binding

- **Không bind cứng `localhost`** — Dùng `0.0.0.0` hoặc để Express tự bind để hoạt động trong container và reverse proxy.
- **Port qua biến môi trường** — `process.env.PORT || 3000`. Không hardcode port trong code.

### File & Upload

- **Không lưu file upload vào thư mục source** — Thư mục `backend/uploads/` phải được map ra Docker volume hoặc chuyển sang object storage (S3, Cloudflare R2) trước khi deploy. File trong source bị mất mỗi lần redeploy.
- **Không commit file upload lên git** — `backend/uploads/*` phải có trong `.gitignore`.

### Database

- **Migration thay vì sync tự động** — Không dùng `sequelize.sync()` hoặc lệnh tạo bảng tự động trong code production. Thay đổi schema phải thông qua migration script có thể rollback.
- **Connection pool có giới hạn** — `pg Pool` phải cấu hình `max` connections phù hợp với giới hạn của DB server trên production.

### Bảo mật production

- **HTTPS bắt buộc** — Khi deploy, đặt reverse proxy (Nginx, Caddy) trước Express để terminate TLS. Express chỉ nhận HTTP nội bộ.
- **Cookie `secure: true`** — JWT cookie phải có `secure: true` trong production (`process.env.NODE_ENV === 'production'`).
- **CORS giới hạn origin** — Không để `origin: '*'` trong production. Chỉ cho phép domain thật.
- **Elasticsearch không public** — ES chỉ accessible nội bộ (không map port ra internet). Security phải bật (`xpack.security.enabled=true`) với password mạnh trên production.

### Graceful shutdown

- **Xử lý `SIGTERM`** — Server phải đóng connection pool và HTTP server sạch khi nhận tín hiệu tắt từ container orchestrator. Không để request đang xử lý bị ngắt giữa chừng.

### Logging production

- **Không `console.log` trong production path** — Đã có trong quy tắc hiện tại, nhắc lại vì quan trọng khi deploy.
- **Log có cấu trúc** — Khi scale lên, log phải đủ để trace lỗi mà không cần SSH vào server. Format `[module] action: detail` đã áp dụng — giữ nhất quán.

---

## Các tính năng cần hoàn thiện

- [ ] Chatbot realtime (nhân vật ảo qua Socket.io + Groq)
- [ ] Tích hợp embedding để semantic search nâng cao
- [ ] Pagination cho comments
- [x] Chatbot realtime — widget floating trên read2 + chapter, Socket.io streaming, lịch sử lưu DB
- [x] Trang đọc truyện theo chương — `GET /api/chapters/:id/content`, lazy crawl + cache vào `chapter_contents`
- [x] Crawl trang JavaScript-rendered bằng Puppeteer — `crawlChapterList.js` (Axios + Cheerio ưu tiên, Puppeteer fallback)

---

@docs/thesis-writing.md
