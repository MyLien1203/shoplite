# Kế hoạch kiểm thử ShopLite: giỏ hàng và đặt hàng

## Application Overview

ShopLite là cửa hàng đồ công nghệ mini (Next.js 16, sau Epic 1). Kế hoạch phủ 8 tiêu chí trong `specs/tieu-chi.md`: GH-1 tới GH-4 (thêm vào giỏ, giới hạn tồn kho, phí giao hàng quanh ngưỡng 500.000 ₫) và DH-1 tới DH-4 (đặt hàng thành công, SĐT sai, địa chỉ biên 9/10 ký tự, hủy đơn).

Quy ước chung:

- Kỳ vọng lấy từ `specs/tieu-chi.md`, không lấy từ những gì màn hình hiện ra lúc khám phá.
- Giỏ hàng nằm trong localStorage nên mỗi kịch bản bắt đầu với giỏ trống (context trình duyệt mới).
- Đơn hàng dùng chung kho dữ liệu với dev server: kịch bản nào kiểm đơn đều lấy mã đơn của chính nó (từ URL sau khi đặt, hoặc từ API tạo đơn) và chỉ làm việc với mã đó.
- `/orders` là form tra cứu (không còn danh sách đơn). `/orders/[id]` chỉ mở được khi trình duyệt là chủ đơn (cookie `sl_own`, cấp lúc đặt hàng cùng trình duyệt) hoặc nhân viên; người khác thấy form tra cứu. Hủy đơn bằng PATCH cũng cần bằng chứng sở hữu, người lạ nhận 404.
- Tên kịch bản bắt đầu bằng mã tiêu chí; test sinh ra mang tag tương ứng, ví dụ `{ tag: "@GH-4" }`. Mỗi kịch bản một file vì generator ghi đè file trùng tên; 1.1 và 1.2 đã viết tay ở bài 6.2 nên dùng chung một file và không sinh lại.
- Hai kịch bản có chú thích "(planner tự nghĩ ra)" không thuộc tiêu chí nào theo nghĩa chặt; lý do giữ ghi ở Bảng A.

## Test Scenarios

### 1. Giỏ hàng và phí giao hàng

**Seed:** `e2e/seed.spec.ts`

#### 1.1. GH-1 thêm sản phẩm còn hàng: giỏ hàng hiện đúng số lượng đã chọn

**File:** `e2e/gio-hang/them-san-pham.spec.ts`

**Steps:**
  1. Mở /products/chuot-khong-day-swiftclick
  2. Trong khối mua hàng, bấm "Tăng số lượng" 2 lần rồi bấm "Thêm vào giỏ"
    - expect: Link giỏ hàng ở đầu trang có tên "Giỏ hàng (3 sản phẩm)"
  3. Bấm link giỏ hàng
    - expect: Có đúng 1 dòng trong giỏ, là Chuột không dây SwiftClick
    - expect: Ô số lượng của dòng đó bằng 3

#### 1.2. GH-1 sản phẩm hết hàng: không có cách nào thêm vào giỏ

**File:** `e2e/gio-hang/them-san-pham.spec.ts`

**Steps:**
  1. Mở /products?category=am-thanh
    - expect: Thẻ "Micro thu âm PodCast USB" có nút "Hết hàng" bị vô hiệu
  2. Bấm tên sản phẩm "Micro thu âm PodCast USB"
    - expect: Trang hiện "Sản phẩm tạm hết hàng. Vui lòng quay lại sau."
    - expect: Không có khối chọn số lượng và nút "Thêm vào giỏ"

#### 1.3. GH-2 giỏ giữ đúng 3 cái khi kho chỉ còn 3: không thể thêm cái thứ 4

**File:** `e2e/gio-hang/gioi-han-ton-kho.spec.ts`

**Steps:**
  1. Mở /products/gia-do-laptop-nhom (Giá đỡ laptop nhôm, 390.000 ₫, tồn kho 3)
    - expect: Trang hiện "Chỉ còn 3 sản phẩm"
  2. Trong khối mua hàng, bấm "Tăng số lượng" 2 lần
    - expect: Ô số lượng bằng 3
    - expect: Nút "Tăng số lượng" bị vô hiệu
  3. Bấm "Thêm vào giỏ"
    - expect: Link giỏ hàng có tên "Giỏ hàng (3 sản phẩm)"
    - expect: Khối mua hàng hiện "Bạn đã có số lượng tối đa của sản phẩm này trong giỏ."
    - expect: Nút mua đổi thành "Tối đa" và bị vô hiệu
    - expect: Nút "Mua ngay" bị vô hiệu
  4. Mở /cart
    - expect: Có đúng 1 dòng, ô số lượng bằng 3
    - expect: Tạm tính 1.170.000 ₫, phí giao hàng (tiêu chuẩn) "Miễn phí"

#### 1.4. GH-3 dưới 500.000đ: tính phí 30.000đ và gợi ý số tiền cần mua thêm

**File:** `e2e/gio-hang/phi-duoi-nguong.spec.ts`

**Steps:**
  1. Thêm 1 Bàn di chuột cỡ lớn DeskMat XL (250.000 ₫) vào giỏ rồi mở /cart
    - expect: Khối tóm tắt hiện "Mua thêm 250.000 ₫ để được miễn phí giao hàng"
    - expect: Tạm tính 250.000 ₫
    - expect: Phí giao hàng (tiêu chuẩn) là 30.000 ₫
    - expect: Tổng cộng 280.000 ₫

#### 1.5. GH-4 đúng 500.000đ: miễn phí giao hàng ở giỏ hàng và trang thanh toán

**File:** `e2e/gio-hang/mien-phi-dung-nguong.spec.ts`

**Steps:**
  1. Thêm 2 Bàn di chuột cỡ lớn DeskMat XL (2 × 250.000 ₫ = 500.000 ₫, đúng ngưỡng) vào giỏ rồi mở /cart
    - expect: Khối tóm tắt hiện "Đơn hàng của bạn được miễn phí giao hàng tiêu chuẩn"
    - expect: Tạm tính 500.000 ₫
    - expect: Phí giao hàng (tiêu chuẩn) là "Miễn phí"
    - expect: Tổng cộng 500.000 ₫
  2. Bấm "Tiến hành thanh toán"
    - expect: Đang ở /checkout
    - expect: Phí giao hàng là "Miễn phí"
    - expect: Tổng thanh toán 500.000 ₫

### 2. Thanh toán và đơn hàng

**Seed:** `e2e/seed.spec.ts`

#### 2.1. DH-1 đặt hàng thành công: đơn Chờ xác nhận, miễn phí giao hàng, giỏ được làm trống

**File:** `e2e/dat-hang/dat-hang-thanh-cong.spec.ts`

**Steps:**
  1. Thêm 2 Bàn di chuột cỡ lớn DeskMat XL vào giỏ, mở /checkout
  2. Điền họ tên "Nguyễn Văn A", SĐT "0912345678", địa chỉ "12 Nguyễn Huệ, Quận 1, TP.HCM"; giữ giao tiêu chuẩn và thanh toán COD
    - expect: Phí giao hàng "Miễn phí", tổng thanh toán 500.000 ₫
  3. Bấm "Đặt hàng"
    - expect: URL dạng /orders/SL-yyyymmdd-XXXXXX?placed=1
    - expect: Hiện "Đặt hàng thành công!"
    - expect: Tiêu đề (heading cấp 1) chứa mã đơn vừa đặt (dạng "Đơn hàng SL-...") và trạng thái "Chờ xác nhận"
    - expect: Tạm tính 500.000 ₫, phí giao hàng "Miễn phí", tổng cộng 500.000 ₫
    - expect: Khách vừa đặt xem được đơn ngay, không phải tra cứu (không thấy form tra cứu)
    - expect: Biểu tượng giỏ hàng không còn số (không có cart-count)

#### 2.2. DH-2 số điện thoại 0212345678 (đầu số 2): báo lỗi, ở lại trang thanh toán, giỏ còn hàng

**File:** `e2e/dat-hang/so-dien-thoai-sai.spec.ts`

**Steps:**
  1. Thêm 1 Cáp USB-C bện dù 2m vào giỏ, mở /checkout, điền họ tên và địa chỉ hợp lệ, SĐT "0212345678"
  2. Bấm "Đặt hàng"
    - expect: Hiện "Số điện thoại không hợp lệ (ví dụ: 0912345678)" dưới ô SĐT; ô SĐT có aria-invalid=true
    - expect: Không có lỗi ở ô họ tên và địa chỉ
    - expect: Vẫn ở /checkout, không sang trang đơn
    - expect: Trình duyệt không gửi POST /api/orders
  3. Mở /cart
    - expect: Giỏ vẫn có đúng 1 dòng Cáp USB-C bện dù 2m, số lượng 1

#### 2.3. DH-2 gửi form trống: báo lỗi từng ô bắt buộc và không tạo đơn (planner tự nghĩ ra)

**File:** `e2e/dat-hang/form-trong.spec.ts`

**Steps:**
  1. Thêm 1 Cáp USB-C bện dù 2m vào giỏ, mở /checkout
  2. Bấm "Đặt hàng" khi chưa điền gì
    - expect: Hiện "Họ tên phải có ít nhất 2 ký tự"
    - expect: Hiện "Số điện thoại không hợp lệ (ví dụ: 0912345678)"
    - expect: Hiện "Địa chỉ phải có ít nhất 10 ký tự"
    - expect: Vẫn ở /checkout, trình duyệt không gửi POST /api/orders

#### 2.4. DH-3 địa chỉ biên 9 và 10 ký tự: 9 bị từ chối, 10 đặt được

**File:** `e2e/dat-hang/dia-chi-bien-10-ky-tu.spec.ts`

**Steps:**
  1. Thêm 1 Cáp USB-C bện dù 2m vào giỏ, mở /checkout, điền họ tên "Nguyễn Văn A", SĐT "0912345678", địa chỉ "12 Le Loi" (đúng 9 ký tự)
  2. Bấm "Đặt hàng"
    - expect: Hiện "Địa chỉ phải có ít nhất 10 ký tự" dưới ô địa chỉ
    - expect: Vẫn ở /checkout, không tạo đơn
  3. Sửa địa chỉ thành "12 Le Loi," (đúng 10 ký tự), bấm "Đặt hàng" lần nữa
    - expect: Lỗi địa chỉ biến mất
    - expect: URL dạng /orders/SL-yyyymmdd-XXXXXX?placed=1
    - expect: Hiện "Đặt hàng thành công!"

#### 2.5. DH-4 hủy đơn chờ xác nhận: bấm "Không" giữ nguyên, xác nhận thì đổi ngay không cần tải lại

**File:** `e2e/dat-hang/huy-don-xac-nhan-hai-lan.spec.ts`

**Steps:**
  1. Tạo một đơn "Chờ xác nhận" qua POST /api/orders bằng chính trình duyệt của test (để là chủ đơn), mở /orders/<mã đơn>
    - expect: Tiêu đề có "Chờ xác nhận"
  2. Bấm "Hủy đơn hàng" rồi bấm "Không"
    - expect: Đã hiện câu hỏi "Bạn chắc chắn muốn hủy đơn hàng này?"
    - expect: Sau khi bấm "Không", tiêu đề vẫn "Chờ xác nhận" và nút "Hủy đơn hàng" còn đó
  3. Bấm "Hủy đơn hàng" rồi "Xác nhận hủy" (chờ phản hồi PATCH /api/orders/<mã đơn>; không tải lại trang)
    - expect: PATCH trả 200
    - expect: Tiêu đề đổi thành "Đã hủy"
    - expect: Nút "Hủy đơn hàng" biến mất nên không hủy lại được

#### 2.6. DH-4 người lạ không hủy được và không xem được đơn của người khác

**File:** `e2e/dat-hang/nguoi-la-khong-huy-duoc.spec.ts`

**Steps:**
  1. Tạo một đơn "Chờ xác nhận" qua POST /api/orders bằng trình duyệt của test, rồi xóa cookie của trình duyệt (trở thành người lạ)
  2. Gửi PATCH /api/orders/<mã đơn> với { "status": "cancelled" }
    - expect: Trả 404
  3. Mở /orders/<mã đơn>
    - expect: Thấy tiêu đề "Tra cứu đơn hàng" và form tra cứu, thông báo "Không tìm thấy đơn hàng. Kiểm tra lại Mã đơn và số điện thoại."
    - expect: Không thấy nút "Hủy đơn hàng" và không thấy tên khách "Khách E2E"
