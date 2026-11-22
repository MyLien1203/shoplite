# ShopLite 🛍️

Cửa hàng đồ công nghệ mini viết bằng **Next.js 16 (App Router) + TypeScript + Tailwind CSS v4**.
Dự án dùng làm mẫu cho các bài thực hành phát triển phần mềm: đủ nhỏ để đọc hiểu trong một buổi,
đủ thật để mở rộng thêm nhiều tính năng.

> Dữ liệu sản phẩm là dữ liệu mẫu, đơn hàng được lưu vào file JSON trên máy - không cần database,
> không cần tài khoản dịch vụ bên ngoài.

## Tính năng

| #   | Tính năng           | Đường dẫn                | Mô tả                                                                                 |
| --- | ------------------- | ------------------------ | ------------------------------------------------------------------------------------- |
| 1   | Trang chủ           | `/`                      | Banner, danh mục, sản phẩm nổi bật                                                    |
| 2   | Danh mục & tìm kiếm | `/products`              | Tìm kiếm không dấu, lọc theo danh mục / khoảng giá / còn hàng, sắp xếp, phân trang    |
| 3   | Chi tiết sản phẩm   | `/products/[slug]`       | Thông tin, thông số kỹ thuật, tình trạng kho, chọn số lượng, sản phẩm liên quan       |
| 4   | Giỏ hàng            | `/cart`                  | Thêm/sửa/xóa, giới hạn theo tồn kho, lưu trong localStorage, gợi ý miễn phí giao hàng |
| 5   | Thanh toán          | `/checkout`              | Form có validate, chọn phương thức giao hàng & thanh toán, tạo đơn qua API            |
| 6   | Đơn hàng            | `/orders`                | Tra cứu bằng Mã đơn + SĐT, xem và hủy đơn của mình khi đang "Chờ xác nhận"            |
| 7   | Khu nhân viên       | `/staff/login`, `/staff` | Đăng nhập bằng mật khẩu, chỉ dành cho nhân viên                                       |

## Yêu cầu

- Node.js **22.12** trở lên (`node -v`)
- npm 10+

## Bắt đầu

```bash
npm install
npm run dev
```

Mở <http://localhost:3000>.

## Các lệnh

| Lệnh                    | Mô tả                                           |
| ----------------------- | ----------------------------------------------- |
| `npm run dev`           | Chạy môi trường phát triển (Turbopack)          |
| `npm run build`         | Build production                                |
| `npm start`             | Chạy bản build production                       |
| `npm run lint`          | Kiểm tra code bằng ESLint                       |
| `npm run typecheck`     | Kiểm tra kiểu TypeScript                        |
| `npm run format`        | Định dạng code bằng Prettier                    |
| `npm test`              | Chạy unit test & component test (Vitest)        |
| `npm run test:watch`    | Chạy test ở chế độ watch                        |
| `npm run test:coverage` | Chạy test và đo độ bao phủ                      |
| `npm run test:e2e`      | Chạy end-to-end test (Playwright)               |
| `npm run check`         | lint + typecheck + test - chạy trước khi commit |

> Lần đầu chạy E2E cần cài trình duyệt: `npx playwright install chromium`

## Cấu trúc thư mục

```text
src/
├── app/                    # Routes (App Router) - chỉ chứa trang và API, logic nằm ở features/
│   ├── api/                # Route Handlers: /api/products, /api/orders, api/staff (đăng nhập/đăng xuất)
│   ├── products/ cart/ checkout/ orders/
│   ├── staff/              # Khu nhân viên: /staff/login, /staff
│   └── layout.tsx
├── proxy.ts                # Chuyển hướng /staff/** về trang đăng nhập khi chưa có phiên
├── features/               # Mỗi thư mục là một tính năng: logic + component + test
│   ├── catalog/            # Tìm kiếm, lọc, sắp xếp, phân trang sản phẩm
│   ├── cart/               # Giỏ hàng (reducer + store localStorage)
│   ├── checkout/           # Quy tắc tính tiền, validate form thanh toán
│   ├── access/             # Phiên nhân viên, bằng chứng sở hữu đơn, giới hạn thử sai
│   ├── inventory/          # Tồn kho hiệu lực (lớp phủ `inventory` lên catalog)
│   ├── staff/              # Giao diện khu nhân viên
│   ├── store/              # Store JSON ghi nguyên tử (storage/store.json)
│   └── orders/             # Tạo / tra cứu / xem / hủy đơn hàng
├── components/             # UI dùng chung (button, layout...)
├── data/                   # Dữ liệu mẫu: sản phẩm, danh mục
└── lib/                    # Tiện ích: format tiền/ngày, cn, http helpers
e2e/                        # Playwright end-to-end tests
storage/                    # (tự tạo khi chạy) store.json (và orders.json cũ) - đã được gitignore
```

## Quy tắc nghiệp vụ chính

- **Giỏ hàng:** tối đa 10 sản phẩm mỗi loại và không vượt quá tồn kho. Sản phẩm hết hàng không thể thêm.
- **Tồn kho thực:** tồn hiển thị ở trang chủ, `/products`, trang chi tiết và `GET /api/products*` là tồn thực, tính từ catalog cộng lớp phủ `inventory` trong `storage/store.json`; tồn đổi khi nhân viên xác nhận đơn và bền qua khởi động lại. Các trang này đọc store mỗi yêu cầu (không dựng sẵn, không cache); store lỗi thì trả 500 chứ không rơi về tồn tĩnh. `CartItem.stock` trong localStorage chỉ để tham khảo, `POST /api/orders` luôn kiểm lại tồn thực.
- **Phí giao hàng:** tiêu chuẩn 30.000 ₫ (miễn phí cho đơn từ 500.000 ₫), giao nhanh 60.000 ₫.
- **Đặt hàng:** server tự tính lại giá từ dữ liệu sản phẩm, không tin giá do client gửi lên.
- **Hủy đơn:** chủ đơn hoặc nhân viên, chỉ khi đơn đang ở trạng thái _Chờ xác nhận_.

## API

| Method  | Endpoint              | Mô tả                                                                                                             |
| ------- | --------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `GET`   | `/api/products`       | Danh sách sản phẩm kèm tồn thực. Query: `q, category, minPrice, maxPrice, inStock, sort, page`                    |
| `GET`   | `/api/products/:slug` | Chi tiết sản phẩm kèm tồn thực                                                                                    |
| `GET`   | `/api/orders?status=` | `active` (mặc định) \| `pending` \| `confirmed` \| `shipping` \| `delivered` \| `cancelled` \| `all`; chỉ nhân viên, trả `{ orders, counts }`, cũ nhất trước, 401 nếu chưa đăng nhập, 400 nếu `status` sai |
| `POST`  | `/api/orders`         | Tạo đơn hàng; cấp cookie chứng minh sở hữu đơn vừa đặt                                                            |
| `POST`  | `/api/orders/lookup`  | `{ orderId, phone }`: đúng thì cấp quyền xem đơn và trả `{ orderId }`, sai 404 chung, quá nhiều lần sai 429       |
| `GET`   | `/api/orders/:id`     | Chủ đơn hoặc nhân viên; người khác 404; trả dữ liệu không có ghi chú nội bộ                                       |
| `PATCH` | `/api/orders/:id`     | Hủy đơn: `{ "status": "cancelled" }`; chủ đơn hoặc nhân viên, người khác 404; trả dữ liệu không có ghi chú nội bộ |
| `POST`  | `/api/staff/login`    | Đăng nhập nhân viên bằng mật khẩu, cấp cookie phiên                                                               |
| `POST`  | `/api/staff/logout`   | Đăng xuất nhân viên (cần phiên; `login` thì không. Các API nhân viên khác trả 401 khi chưa có phiên)              |
| `GET`   | `/api/staff/orders/:id` | Nhân viên: trả đơn đầy đủ kể cả `internalNotes`; 401 khi không có phiên; 404 (`ORDER_NOT_FOUND`) |
| `POST`  | `/api/staff/orders/:id/transition` | `{ target, trackingCode?, expectedDeliveryDate? }` (`target`: `pending` \| `confirmed` \| `shipping` \| `delivered` \| `cancelled`): nhân viên đổi trạng thái, xác nhận trừ tồn thực; `trackingCode` (≤ 50 ký tự, không ký tự điều khiển/`<`/`>`) và `expectedDeliveryDate` (`YYYY-MM-DD`, không sớm hơn ngày tạo đơn theo giờ VN) chỉ nhận khi chuyển Đã xác nhận → Đang giao (để trống thì bỏ qua), ở bước khác là 400; trả đơn đầy đủ; lặp tới đúng trạng thái hiện tại là 200, không đổi gì; 401 khi không có phiên; 400 (`VALIDATION_ERROR`), 404 (`ORDER_NOT_FOUND`), 409 (`INSUFFICIENT_STOCK`, `INVALID_STATUS_TRANSITION`) |

Lỗi trả về dạng `{ "error": { "code": "...", "message": "...", "details": { ... } } }`.

Mọi API ghi (`POST`, `PATCH`) yêu cầu `Content-Type: application/json` và, nếu có header `Origin`,
`Origin` phải trùng `Host`. Ví dụ `curl` bên dưới vẫn đúng vì không gửi `Origin`.

Ví dụ tạo đơn hàng:

```bash
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -d '{
    "customer": { "fullName": "Nguyễn Văn A", "phone": "0912345678", "address": "12 Nguyễn Huệ, Quận 1, TP.HCM" },
    "shippingMethod": "standard",
    "paymentMethod": "cod",
    "items": [{ "productId": "p006", "quantity": 2 }]
  }'
```

## Biến môi trường

Sao chép `.env.example` thành `.env.local` rồi điền giá trị. Không commit file `.env*` thật.

| Biến                 | Bắt buộc           | Mặc định              | Mô tả                                                                                       |
| -------------------- | ------------------ | --------------------- | ------------------------------------------------------------------------------------------- |
| `STAFF_PASSWORD`     | Có (khu nhân viên) | không có              | Mật khẩu đăng nhập khu nhân viên. Thiếu thì khu nhân viên từ chối mọi truy cập.             |
| `SESSION_SECRET`     | Có (khu nhân viên) | không có              | Khóa ký cookie phiên, tối thiểu 32 ký tự. Thiếu hoặc quá ngắn thì khu nhân viên bị từ chối. |
| `STORE_CONTACT`      | Không              | không có              | Thông tin liên hệ cửa hàng; sẽ có hiệu lực từ Epic 4.                                       |
| `STORE_FILE`         | Không              | `storage/store.json`  | Đường dẫn file dữ liệu chính của cửa hàng.                                                  |
| `ORDERS_FILE`        | Không              | `storage/orders.json` | File đơn hàng cũ, chỉ đọc để nhập dữ liệu lần đầu vào store.                                |
| `TRUSTED_PROXY_HOPS` | Không              | `0`                   | Số proxy tin cậy phía trước (0-99) để xác định địa chỉ máy khách từ `x-forwarded-for`.      |
| `COOKIE_SECURE`      | Không              | suy từ giao thức      | `true` hoặc `false` để ép cờ `Secure` của cookie; giá trị khác thì suy từ giao thức.        |

## Giấy phép

[MIT](./LICENSE)
