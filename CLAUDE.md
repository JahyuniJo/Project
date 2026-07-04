# CLAUDE.md — Đồ Án Tốt Nghiệp: Nền Tảng Đọc Truyện Trực Tuyến

## Tổng quan dự án

Website đọc truyện trực tuyến tích hợp AI và tìm kiếm toàn văn, xây dựng cho Đồ Án Tốt Nghiệp. Hệ thống thu thập (crawl) truyện từ nguồn bên ngoài, tìm kiếm nhanh qua Elasticsearch, tóm tắt nội dung bằng AI (Groq), gợi ý truyện theo lịch sử đọc, và tương tác thời gian thực qua Socket.io.

---

## Kiến trúc hệ thống

**Monorepo**: Backend Express phục vụ SPA React build sẵn và làm API server.

```
Project/
├── backend/
│   ├── app.js                  # Entry point: HTTP, Socket.io, routes, serve SPA dist
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
│   │   ├── aiService.js        # callAI()/callAIStream()/callAIRaw()/callVisionAI() — Groq API
│   │   ├── chapterSummaryService.js # Tóm tắt chapter bằng vision + recap theo tiến độ đọc
│   │   ├── searchService.js    # Elasticsearch + SQL fallback
│   │   └── embedding.js        # OpenAI embeddings (tuỳ chọn)
│   └── utils/
│       ├── createIndex.js      # Script tạo ES index
│       ├── syncSQL.js          # Script sync PostgreSQL → Elasticsearch
│       ├── normalizeText.js    # removeVietnameseTones()
│       ├── validators.js       # Hằng số validate dùng chung (EMAIL_REGEX, MIN_PASSWORD_LENGTH)
│       ├── createChatTables.js # Migration script: bảng chat_messages + index
│       └── createChapterSummaryTable.js # Migration script: bảng chapter_summaries + index
├── frontend/
│   ├── app/                    # React SPA (Vite + Tailwind v4)
│   │   ├── src/
│   │   │   ├── main.jsx        # Mount + BrowserRouter + QueryClient + AuthProvider
│   │   │   ├── App.jsx         # Khai báo toàn bộ <Routes>
│   │   │   ├── api/            # client.js + stories.js + auth.js + admin.js + ...
│   │   │   ├── context/        # AuthContext.jsx, AlertContext.jsx
│   │   │   ├── components/     # Layout, Header, AdminLayout, ChatWidget, CommentTree, ...
│   │   │   └── pages/
│   │   │       ├── public/     # Home, Login, Register, Read, Chapter, ForgotPassword, ResetPassword
│   │   │       ├── private/    # Home2, Info, Read2, Fav, ErrorReport
│   │   │       └── admin/      # Dashboard, Users, Stat, Stories, Reports, Chat
│   │   ├── dist/               # Build output — Express serve từ đây (production)
│   │   └── vite.config.js      # Proxy /api /socket.io /uploads /assets → :3001 (dev)
│   └── assets/
│       └── images/             # Logo, favicon (Express serve tại /assets)
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
| Frontend | **React 18 + Vite + Tailwind CSS v4** (`frontend/app/`) |
| Routing | React Router v6 — `BrowserRouter`, `ProtectedRoute`, `AdminLayout` |
| Server state | TanStack Query (React Query) — cache, loading/error tự động |
| HTTP client | Axios — instance `withCredentials: true`, interceptor 401 → `/login` |
| Auth | JWT trong HTTP-only cookie (`authToken`) |
| ORM | `pg` Pool (queries) + Sequelize (model schema) |

---

## Cách chạy dự án

```bash
# Backend (từ thư mục gốc)
npm start          # nodemon → node backend/app.js — http://localhost:3001

# Frontend dev (từ frontend/app/)
cd frontend/app
npm run dev        # Vite dev server :5173, proxy /api + /socket.io → :3001

# Frontend build (production)
cd frontend/app
npm run build      # Output → frontend/app/dist/ (Express serve từ đây)

# Elasticsearch (từ backend/)
cd backend
npm run es:create-index   # Tạo index
npm run es:sync           # Sync dữ liệu PostgreSQL → Elasticsearch
```

**Yêu cầu:** PostgreSQL tại `localhost:5432`, Elasticsearch tại `localhost:9200`.

**Lưu ý dev:** Chạy backend (:3001) và `npm run dev` frontend (:5173) song song. Vite proxy đảm bảo cookie JWT hoạt động đúng (cùng origin).

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
GROQ_VISION_MODEL=meta-llama/llama-4-scout-17b-16e-instruct

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
| GET | `/api/stories/:id/recap?chapter=N` | Tóm tắt nội dung các chương đã đọc (1→N) bằng vision AI | Không |
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

## React Routes & Bảo vệ route

Frontend là SPA React — bảo vệ route thật vẫn ở API (JWT middleware). Client-side `<ProtectedRoute>` chỉ là UX (redirect khi chưa đăng nhập / sai role).

| Route React | Component | Guard |
|---|---|---|
| `/` | `pages/public/Home` | Tất cả |
| `/login` | `pages/public/Login` | Tất cả |
| `/register` | `pages/public/Register` | Tất cả |
| `/forgot` | `pages/public/ForgotPassword` | Tất cả |
| `/reset-password` | `pages/public/ResetPassword` | Tất cả |
| `/read` | `pages/public/Read` | Tất cả |
| `/chapter/:id` | `pages/public/Chapter` | Tất cả |
| `/home` | `pages/private/Home2` | Đăng nhập |
| `/info` | `pages/private/Info` | Đăng nhập |
| `/read2` | `pages/private/Read2` | Đăng nhập |
| `/fav` | `pages/private/Fav` | Role: `user` |
| `/error-report` | `pages/private/ErrorReport` | Role: `user` |
| `/admin` | `pages/admin/Dashboard` | Role: `admin` |
| `/admin/stories` | `pages/admin/Stories` | Role: `admin` |
| `/admin/users` | `pages/admin/Users` | Role: `admin` |
| `/admin/stat` | `pages/admin/Stat` | Role: `admin` |
| `/admin/reports` | `pages/admin/Reports` | Role: `admin` |
| `/admin/chat` | `pages/admin/Chat` | Role: `admin` |

Admin routes dùng `<AdminLayout>` (fixed sidebar + header riêng), tách biệt khỏi `<Layout>` công cộng.

---

## Tính năng AI & Search

### Chatbot trợ lý truyện (Groq API + Socket.io)
- Widget nổi (floating, bottom-right) trên `read2.html` và `chapter.html`
- Bắt buộc đăng nhập; lịch sử lưu vào bảng `chat_messages` (PostgreSQL)
- Streaming qua Socket.io: client emit `chatMessage` → server emit từng `chatChunk` → `chatDone`
- System prompt tự động nhúng context truyện (title, author, genres, description, ai_summary)
- Khi user đang đọc chương N: nhúng thêm **recap** nội dung chương 1→N từ `chapter_summaries` (xem mục Tóm tắt chương bằng vision) — giúp bot trả lời đúng "tóm tắt lại những gì tôi đã đọc" mà không spoil chương N+1 trở đi
- Cooldown 2 giây per socket để tránh spam
- Lịch sử 20 tin gần nhất được đưa vào context mỗi lần gọi AI
- File: [backend/routes/chatRoutes.js](backend/routes/chatRoutes.js), [frontend/app/src/components/ChatWidget.jsx](frontend/app/src/components/ChatWidget.jsx)

### Tóm tắt chương bằng vision (Groq llama-4-scout)
- Sau khi crawl ảnh chương lần đầu ([backend/routes/chapterRoutes.js](backend/routes/chapterRoutes.js)), gọi `summarizeChapterImages()` **fire-and-forget** (không block response) để Groq vision model đọc trực tiếp ảnh chương và tóm tắt diễn biến
- Ảnh được gửi theo batch tối đa **5 ảnh/lượt** (giới hạn model `meta-llama/llama-4-scout-17b-16e-instruct`); nhiều batch được cô đặc lại bằng 1 lượt gọi text model thành 1 `summary`/chapter, lưu vào bảng `chapter_summaries`
- Model vision từ chối ảnh > 33.177.600 px (ảnh scan truyện tranh gốc thường vượt mức này) và ảnh < 2px mỗi chiều — mỗi ảnh được tải về và resize bằng `sharp` (dưới 30.000.000 px, cạnh dài tối đa 768px để giảm token/lượt gọi, cạnh ngắn luôn ≥ 2px, encode JPEG base64) trước khi gửi. Ảnh tải lỗi/rỗng/bị chặn, hoặc dải phân cách/banner mỏng (cạnh ngắn < 16px) bị bỏ qua thay vì làm hỏng cả batch; batch toàn ảnh lỗi cũng bị bỏ
- Dedup theo `chapter_id` (đăng ký pending **đồng bộ** trước mọi `await`) để hai request mở cùng chương không kích hoạt hai lượt tóm tắt song song đốt trùng quota token
- Groq tính rate limit theo token/phút (TPM, hiện 30.000/phút cho tier on_demand) trên toàn organization cho model vision — `callVisionAI()` (`aiService.js`) tự ước lượng thời gian chờ trước lượt gọi tiếp theo dựa trên `usage.total_tokens` thật trả về (chỉ tiêu thụ tối đa 85% quota), và mọi lượt gọi vision trong toàn app đi qua 1 mutex để luôn chạy nối tiếp dù nhiều chapter được tóm tắt cùng lúc. Khi vẫn gặp lỗi 429, tự retry tối đa 3 lần, chờ đúng thời gian Groq đề xuất trong message lỗi
- Hai hàm tổng hợp dùng chung dữ liệu này nhưng mục đích khác nhau:
  - `aggregateIntroSummary(storyId)` — gộp vài chương đầu, không spoil → dùng cho `stories.ai_summary`
  - `getReadingRecap(storyId, upToChapterNum)` — gộp chương 1→N đã đọc, cache in-memory 10 phút → dùng cho chatbot context và `GET /api/stories/:id/recap`
- File: [backend/services/chapterSummaryService.js](backend/services/chapterSummaryService.js), [backend/services/aiService.js](backend/services/aiService.js) (`callVisionAI`)

### Tóm tắt truyện (Groq API)
- `POST /api/ai/summarize` với `{ story_id }`
- Nếu `ai_summary` đã tồn tại trong DB → trả về ngay, không gọi lại AI
- Ưu tiên `aggregateIntroSummary()` (dựa trên nội dung ảnh chapter thật qua vision) — fallback sang tóm tắt từ `description` nếu truyện chưa có `chapter_summaries`
- Model text: `llama-3.1-8b-instant`, temperature 0.3
- File: [backend/services/aiService.js](backend/services/aiService.js), [backend/services/chapterSummaryService.js](backend/services/chapterSummaryService.js)

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

## Database table (PostgreSQL)

-- This script was generated by the ERD tool in pgAdmin 4.
-- Please log an issue at https://github.com/pgadmin-org/pgadmin4/issues/new/choose if you find any bugs, including reproduction steps.
BEGIN;


CREATE TABLE IF NOT EXISTS public.chapter_contents
(
    chapter_id integer NOT NULL,
    images jsonb NOT NULL,
    crawled_at timestamp with time zone DEFAULT now(),
    CONSTRAINT chapter_contents_pkey PRIMARY KEY (chapter_id)
);

CREATE TABLE IF NOT EXISTS public.chapters
(
    id serial NOT NULL,
    story_id integer NOT NULL,
    chapter_num double precision NOT NULL,
    title text COLLATE pg_catalog."default",
    source_url text COLLATE pg_catalog."default" NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT chapters_pkey PRIMARY KEY (id),
    CONSTRAINT chapters_story_id_chapter_num_key UNIQUE (story_id, chapter_num)
);

CREATE TABLE IF NOT EXISTS public.chat_messages
(
    id serial NOT NULL,
    user_id integer NOT NULL,
    story_id integer,
    role character varying(10) COLLATE pg_catalog."default" NOT NULL,
    content text COLLATE pg_catalog."default" NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    metadata jsonb,
    CONSTRAINT chat_messages_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.comment_likes
(
    id serial NOT NULL,
    user_id integer,
    comment_id integer,
    CONSTRAINT comment_likes_pkey PRIMARY KEY (id),
    CONSTRAINT comment_likes_user_id_comment_id_key UNIQUE (user_id, comment_id)
);

CREATE TABLE IF NOT EXISTS public.comments
(
    id integer NOT NULL GENERATED ALWAYS AS IDENTITY ( INCREMENT 1 START 1 MINVALUE 1 MAXVALUE 2147483647 CACHE 1 ),
    story_id integer NOT NULL,
    user_id integer NOT NULL,
    parent_id integer,
    content text COLLATE pg_catalog."default" NOT NULL,
    likes integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT comments_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.favorite_lists
(
    id serial NOT NULL,
    iduser integer,
    name text COLLATE pg_catalog."default" NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT favorite_lists_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.favorite_stories
(
    id serial NOT NULL,
    list_id integer,
    story_id integer,
    added_at timestamp without time zone DEFAULT now(),
    CONSTRAINT favorite_stories_pkey PRIMARY KEY (id),
    CONSTRAINT favorite_stories_list_id_story_id_key UNIQUE (list_id, story_id)
);

CREATE TABLE IF NOT EXISTS public.notifications
(
    id serial NOT NULL,
    user_email text COLLATE pg_catalog."default" NOT NULL,
    message text COLLATE pg_catalog."default" NOT NULL,
    is_read boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT now(),
    link text COLLATE pg_catalog."default",
    CONSTRAINT notifications_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.ratings
(
    id integer NOT NULL GENERATED ALWAYS AS IDENTITY ( INCREMENT 1 START 1 MINVALUE 1 MAXVALUE 2147483647 CACHE 1 ),
    story_id integer NOT NULL,
    user_id integer NOT NULL,
    rating integer NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ratings_pkey PRIMARY KEY (id),
    CONSTRAINT unique_rating UNIQUE (story_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.reports
(
    id serial NOT NULL,
    title character varying(255) COLLATE pg_catalog."default",
    story_url text COLLATE pg_catalog."default",
    message text COLLATE pg_catalog."default" NOT NULL,
    screenshot_path text COLLATE pg_catalog."default",
    status character varying(20) COLLATE pg_catalog."default" DEFAULT 'pending'::character varying,
    user_email character varying(255) COLLATE pg_catalog."default",
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    response text COLLATE pg_catalog."default",
    updated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT reports_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.stories
(
    id serial NOT NULL,
    title character varying(300) COLLATE pg_catalog."default" NOT NULL,
    author character varying(100) COLLATE pg_catalog."default",
    description text COLLATE pg_catalog."default",
    cover_url text COLLATE pg_catalog."default",
    status character varying(20) COLLATE pg_catalog."default",
    created_at timestamp without time zone DEFAULT now(),
    genres text[] COLLATE pg_catalog."default",
    url text COLLATE pg_catalog."default",
    view_count integer DEFAULT 0,
    ai_summary text COLLATE pg_catalog."default",
    CONSTRAINT stories_pkey PRIMARY KEY (id),
    CONSTRAINT unique_story_title UNIQUE (title)
);

CREATE TABLE IF NOT EXISTS public.user_story_views
(
    id serial NOT NULL,
    user_id integer NOT NULL,
    story_id integer NOT NULL,
    viewed_at timestamp without time zone DEFAULT now(),
    CONSTRAINT user_story_views_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.users
(
    id serial NOT NULL,
    username character varying(100) COLLATE pg_catalog."default",
    email character varying(100) COLLATE pg_catalog."default",
    password character varying(200) COLLATE pg_catalog."default",
    role character varying(10) COLLATE pg_catalog."default" DEFAULT 'user'::character varying,
    avatar_url text COLLATE pg_catalog."default" DEFAULT '/images/default-avatar.png'::text,
    otp character varying(6) COLLATE pg_catalog."default",
    otp_expires timestamp without time zone,
    created_at timestamp with time zone DEFAULT now(),
    locked_until timestamp with time zone,
    CONSTRAINT users_pkey PRIMARY KEY (id),
    CONSTRAINT users_email_key UNIQUE (email)
);

ALTER TABLE IF EXISTS public.chapter_contents
    ADD CONSTRAINT chapter_contents_chapter_id_fkey FOREIGN KEY (chapter_id)
    REFERENCES public.chapters (id) MATCH SIMPLE
    ON UPDATE NO ACTION
    ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS chapter_contents_pkey
    ON public.chapter_contents(chapter_id);


ALTER TABLE IF EXISTS public.chapters
    ADD CONSTRAINT chapters_story_id_fkey FOREIGN KEY (story_id)
    REFERENCES public.stories (id) MATCH SIMPLE
    ON UPDATE NO ACTION
    ON DELETE CASCADE;


ALTER TABLE IF EXISTS public.chat_messages
    ADD CONSTRAINT chat_messages_story_id_fkey FOREIGN KEY (story_id)
    REFERENCES public.stories (id) MATCH SIMPLE
    ON UPDATE NO ACTION
    ON DELETE CASCADE;


ALTER TABLE IF EXISTS public.chat_messages
    ADD CONSTRAINT chat_messages_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES public.users (id) MATCH SIMPLE
    ON UPDATE NO ACTION
    ON DELETE CASCADE;


ALTER TABLE IF EXISTS public.comment_likes
    ADD CONSTRAINT comment_likes_comment_id_fkey FOREIGN KEY (comment_id)
    REFERENCES public.comments (id) MATCH SIMPLE
    ON UPDATE NO ACTION
    ON DELETE CASCADE;


ALTER TABLE IF EXISTS public.comment_likes
    ADD CONSTRAINT comment_likes_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES public.users (id) MATCH SIMPLE
    ON UPDATE NO ACTION
    ON DELETE CASCADE;


ALTER TABLE IF EXISTS public.favorite_lists
    ADD CONSTRAINT favorite_lists_iduser_fkey FOREIGN KEY (iduser)
    REFERENCES public.users (id) MATCH SIMPLE
    ON UPDATE NO ACTION
    ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_favorite_lists_iduser
    ON public.favorite_lists(iduser);


ALTER TABLE IF EXISTS public.favorite_stories
    ADD CONSTRAINT favorite_stories_list_id_fkey FOREIGN KEY (list_id)
    REFERENCES public.favorite_lists (id) MATCH SIMPLE
    ON UPDATE NO ACTION
    ON DELETE CASCADE;


ALTER TABLE IF EXISTS public.favorite_stories
    ADD CONSTRAINT favorite_stories_story_id_fkey FOREIGN KEY (story_id)
    REFERENCES public.stories (id) MATCH SIMPLE
    ON UPDATE NO ACTION
    ON DELETE CASCADE;

END;

### Quan hệ chapters

- Mỗi `chapter_contents` chứa `images: ["url1", "url2", ...]` — danh sách ảnh của chương đó (truyện tranh)
- Crawl chương: lưu metadata vào `chapters`, lưu ảnh vào `chapter_contents`
- `chapter_num` dùng `float8` để hỗ trợ chương thập phân (vd: 10.5)
- `chapter_summaries` được tạo **tự động, fire-and-forget** ngay sau lần crawl ảnh đầu tiên của 1 chương (không tạo lại nếu đã tồn tại) — denormalize `story_id`, `chapter_num` để query range nhanh không cần JOIN qua `chapters`

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
| `chapter_summaries` | `chapter_summaries_pkey` | UNIQUE btree(chapter_id) | PK + FK lookup |
| `chapter_summaries` | `idx_chapter_summaries_story_chapter` | btree(story_id, chapter_num) | Query range chương đã đọc cho recap, không cần JOIN |
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
- [x] Tóm tắt chương bằng vision model (Groq llama-4-scout) — cache `chapter_summaries`, dùng cho `ai_summary` giới thiệu + recap chatbot/`GET /api/stories/:id/recap`

---

@docs/thesis-writing.md
