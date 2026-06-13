# CHƯƠNG 2. KHẢO SÁT VÀ PHÂN TÍCH YÊU CẦU

## 2.1 Khảo sát hiện trạng các nền tảng đọc truyện trực tuyến

Thị trường đọc truyện tranh trực tuyến tại Việt Nam hiện được dẫn dắt bởi các nền tảng có lượng truy cập lớn như NetTruyen, TruyenQQ hay Truyện Tranh LH, bên cạnh những nền tảng quốc tế quy mô toàn cầu như Webtoon và MangaDex. Điểm mạnh chung của các hệ thống này nằm ở kho nội dung khổng lồ được cập nhật liên tục và một quy trình đọc theo chương đã được tối ưu qua nhiều năm vận hành. Người dùng có thể dễ dàng tiếp cận hàng nghìn đầu truyện thuộc nhiều thể loại khác nhau, theo dõi chương mới và lưu lại lịch sử đọc của mình. Tuy nhiên, khi đi sâu vào trải nghiệm thực tế, các nền tảng này vẫn bộc lộ nhiều hạn chế cố hữu khiến việc khám phá và tương tác với nội dung trở nên kém hiệu quả.

Hạn chế đầu tiên và rõ rệt nhất nằm ở năng lực tìm kiếm. Phần lớn các nền tảng hiện hành chỉ hỗ trợ tìm kiếm theo từ khóa khớp chính xác trên tên truyện hoặc tên tác giả, dựa trên cơ chế truy vấn cơ sở dữ liệu quan hệ thông thường. Cách tiếp cận này buộc người dùng phải nhớ chính xác tên truyện mới có thể tìm thấy, trong khi nhu cầu thực tế của độc giả thường mang tính mô tả và mơ hồ. Khi một người dùng muốn tìm "truyện có nhân vật chính mạnh mẽ phiêu lưu trong thế giới phép thuật" hay "truyện tình cảm học đường nhẹ nhàng", các công cụ tìm kiếm theo từ khóa gần như không thể trả về kết quả phù hợp vì chúng không nắm bắt được ý nghĩa ngữ nghĩa đằng sau câu mô tả. Hệ quả là người dùng phải tự mình duyệt thủ công qua hàng loạt danh mục thể loại, một quá trình tốn thời gian và dễ gây nản lòng.

Hạn chế thứ hai liên quan đến sự thiếu vắng các công cụ hỗ trợ thông minh trong suốt hành trình đọc. Các nền tảng truyền thống đóng vai trò thuần túy là nơi lưu trữ và hiển thị nội dung, mà không cung cấp bất kỳ sự trợ giúp nào giúp người dùng nắm bắt nhanh cốt truyện hay giải đáp thắc mắc trong quá trình đọc. Một độc giả quay lại một bộ truyện dài sau thời gian gián đoạn thường gặp khó khăn trong việc nhớ lại diễn biến đã đọc, nhưng lại không có công cụ nào để tóm tắt nội dung một cách an toàn mà không tiết lộ tình tiết phía trước. Tương tự, việc tìm một bộ truyện khác tương tự với bộ đang đọc hoàn toàn phụ thuộc vào kinh nghiệm cá nhân hoặc các gợi ý chung chung dựa trên lượt xem, thiếu sự cá nhân hóa theo sở thích thực sự của từng người.

Hạn chế thứ ba nằm ở khâu thu thập và đồng bộ nội dung. Việc duy trì một kho truyện luôn cập nhật đòi hỏi quá trình thu thập dữ liệu từ nhiều nguồn khác nhau, trong đó nhiều trang nguồn sử dụng kỹ thuật tải ảnh động bằng JavaScript hoặc áp dụng các biện pháp chống thu thập tự động. Nếu hệ thống tải toàn bộ nội dung của mọi chương ngay từ đầu, chi phí lưu trữ và băng thông sẽ tăng vọt một cách lãng phí, bởi phần lớn các chương có thể không bao giờ được người dùng truy cập đến. Bài toán đặt ra là làm sao cân bằng giữa tốc độ phục vụ người đọc và việc sử dụng tài nguyên một cách tiết kiệm, hợp lý.

Từ những phân tích về hạn chế của các hệ thống hiện hành, yêu cầu cấp thiết đầu tiên đặt ra cho hệ thống mới là phải xây dựng được năng lực tìm kiếm thông minh, vượt ra ngoài giới hạn của tìm kiếm theo từ khóa. Hệ thống cần kết hợp giữa tìm kiếm toàn văn tốc độ cao để xử lý các truy vấn rõ ràng và tìm kiếm ngữ nghĩa để hiểu được ý định mô tả mơ hồ của người dùng. Sự kết hợp này phải đảm bảo trả về kết quả chính xác và phù hợp ngay cả khi người dùng không nhớ chính xác tên truyện, đồng thời vẫn duy trì được khả năng phản hồi nhanh và ổn định khi hạ tầng tìm kiếm chuyên dụng gặp sự cố.

Song song với yêu cầu về tìm kiếm, hệ thống mới cần tích hợp một lớp trợ lý thông minh nhằm nâng cao trải nghiệm trong suốt hành trình đọc. Lớp trợ lý này phải có khả năng tóm tắt nội dung truyện một cách cô đọng nhưng không làm lộ tình tiết quan trọng, trả lời các câu hỏi của người dùng dựa trên ngữ cảnh cụ thể của bộ truyện đang đọc, và chủ động gợi ý những bộ truyện phù hợp với sở thích được suy ra từ lịch sử đọc. Việc đưa trí tuệ nhân tạo vào quy trình đọc không chỉ giúp người dùng tiết kiệm thời gian mà còn tạo ra sự khác biệt rõ rệt so với các nền tảng thuần túy lưu trữ nội dung.

Cuối cùng, để giải quyết bài toán thu thập và phục vụ nội dung một cách hiệu quả, hệ thống cần áp dụng cơ chế thu thập theo nhu cầu kết hợp với lưu đệm. Thay vì tải trước toàn bộ nội dung, hệ thống chỉ thu thập ảnh của một chương vào thời điểm chương đó thực sự được người dùng yêu cầu lần đầu, sau đó lưu lại để phục vụ các lượt truy cập tiếp theo mà không cần thu thập lại. Cơ chế này vừa giảm thiểu chi phí tài nguyên, vừa đảm bảo tốc độ phản hồi nhanh cho những nội dung phổ biến, đồng thời cần được thiết kế đủ linh hoạt để xử lý cả những trang nguồn yêu cầu trình duyệt thực thi JavaScript.

## 2.2 Tổng quan chức năng

Hệ thống được thiết kế và xây dựng như một nền tảng đa người dùng toàn diện, phục vụ ba nhóm tác nhân chính với phạm vi quyền hạn được phân cấp rõ ràng. Nhóm đầu tiên là Khách, đại diện cho người dùng chưa đăng nhập, được phép tự do khám phá kho truyện, tìm kiếm và đọc các nội dung công khai nhằm tạo điều kiện tiếp cận thấp nhất cho người mới. Nhóm thứ hai là Độc giả, tức người dùng đã đăng nhập, kế thừa toàn bộ khả năng của Khách và được mở rộng thêm các chức năng tương tác cá nhân hóa như bình luận, đánh giá, quản lý danh sách yêu thích, trò chuyện với trợ lý AI và nhận gợi ý truyện. Nhóm cuối cùng là Quản trị viên, đóng vai trò kiểm soát toàn bộ vận hành của nền tảng, bao gồm quản lý kho truyện, quản lý người dùng, theo dõi thống kê và xử lý các báo lỗi để đảm bảo hệ thống hoạt động ổn định, minh bạch.

### 2.2.1 Biểu đồ use case tổng quan

Biểu đồ Use Case tổng quan trong Hình 2.1 phác họa phạm vi hoạt động của hệ thống và mối tương quan giữa các tác nhân với các nhóm chức năng chính.

> **[Hình 2.1: Biểu đồ use case tổng quan]**

Trong mô hình này, tác nhân Khách đại diện cho người dùng cuối ở mức tiếp cận cơ bản nhất, đóng vai trò là người tiêu thụ nội dung tiềm năng của nền tảng. Mục tiêu cốt lõi của họ xoay quanh việc khám phá kho truyện và tìm kiếm những bộ truyện phù hợp với sở thích. Hành trình của Khách thường bắt đầu bằng việc xem danh sách truyện được hiển thị trên trang chủ, sử dụng công cụ tìm kiếm để lọc theo nhu cầu, rồi truy cập vào trang chi tiết để xem thông tin tổng quan và đọc thử các chương công khai. Khi muốn sử dụng các tính năng nâng cao, họ thực hiện chức năng Đăng ký và Đăng nhập để thiết lập danh tính và mở khóa toàn bộ trải nghiệm.

Trọng tâm tương tác của tác nhân Độc giả nằm ở các chức năng đòi hỏi định danh người dùng. Sau khi đăng nhập, Độc giả có thể đọc truyện theo từng chương với trải nghiệm liền mạch, đồng thời tham gia vào cộng đồng thông qua việc viết bình luận, phản hồi bình luận khác và đánh giá chất lượng truyện theo thang điểm. Họ cũng có thể chủ động xây dựng các danh sách yêu thích để tổ chức kho truyện cá nhân, quản lý thông tin hồ sơ và gửi báo lỗi khi phát hiện sự cố về nội dung. Đặc biệt, Độc giả được tiếp cận lớp tính năng trí tuệ nhân tạo của hệ thống, bao gồm trò chuyện với trợ lý AI để được hỗ trợ trong quá trình đọc, xem bản tóm tắt nội dung do AI sinh ra và nhận các gợi ý truyện được cá nhân hóa theo lịch sử đọc của riêng mình.

Tác nhân thứ ba là Quản trị viên, người giữ vai trò điều phối, giám sát và đảm bảo tính toàn vẹn của toàn bộ nền tảng. Khác với hai tác nhân trước vốn tập trung vào việc tiêu thụ nội dung, Quản trị viên đứng ở vị trí kiểm soát và vận hành. Quyền hạn của Quản trị viên bao gồm việc quản lý kho truyện, từ thao tác thu thập nội dung từ nguồn bên ngoài đến việc thêm, sửa, xóa và đồng bộ dữ liệu với hệ thống tìm kiếm. Bên cạnh đó, Quản trị viên còn nắm giữ công cụ quản lý người dùng để kiểm soát các tài khoản trong hệ thống, theo dõi các báo cáo thống kê về hoạt động đọc và tương tác AI nhằm nắm bắt bức tranh tổng thể, đồng thời tiếp nhận và xử lý các báo lỗi do độc giả gửi đến để liên tục cải thiện chất lượng dịch vụ.

### 2.2.2 Biểu đồ phân rã Use Case "Đọc truyện"

Để mô tả chi tiết quy trình tương tác giữa người dùng và hệ thống trong chức năng cốt lõi là Đọc truyện, Use Case tổng quát này được phân rã thành các hành động cụ thể theo trình tự thời gian như Hình 2.2. Quy trình bắt đầu với việc người dùng chọn một bộ truyện từ danh sách và truy cập vào trang chi tiết. Tại đây, hệ thống trình bày đầy đủ thông tin tổng quan của bộ truyện bao gồm tên, tác giả, thể loại, mô tả nội dung, đánh giá trung bình và danh sách các chương hiện có, giúp người dùng nắm bắt được toàn cảnh trước khi quyết định bắt đầu đọc.

> **[Hình 2.2: Biểu đồ phân rã Use Case "Đọc truyện"]**

Bước tiếp theo trong quy trình là chọn chương để đọc. Khi người dùng chọn một chương cụ thể, hệ thống thực hiện kiểm tra xem nội dung ảnh của chương đó đã được lưu trong cơ sở dữ liệu hay chưa. Nếu chương đã được lưu đệm từ trước, hệ thống trả về danh sách ảnh ngay lập tức để phục vụ người đọc với độ trễ thấp nhất. Trong trường hợp chương được truy cập lần đầu và chưa có nội dung, hệ thống kích hoạt cơ chế thu thập theo nhu cầu, tiến hành tải ảnh của chương từ nguồn bên ngoài, lưu lại vào cơ sở dữ liệu rồi mới trả về cho người dùng. Cơ chế thu thập kết hợp lưu đệm này đảm bảo cân bằng giữa tốc độ phục vụ và việc tiết kiệm tài nguyên lưu trữ.

Trong quá trình đọc, hệ thống cung cấp các thao tác điều hướng linh hoạt cho phép người dùng chuyển sang chương kế tiếp hoặc quay lại chương trước một cách thuận tiện, đồng thời ghi nhận lịch sử đọc của những người dùng đã đăng nhập. Việc ghi nhận lịch sử đọc không chỉ phục vụ mục đích cho phép người dùng tiếp tục đọc từ vị trí đã dừng, mà còn là nguồn dữ liệu quan trọng để hệ thống suy ra sở thích và phục vụ cho các chức năng gợi ý truyện cũng như cá nhân hóa trợ lý AI. Đối với những bộ truyện yêu cầu đăng nhập, hệ thống áp dụng cơ chế kiểm soát quyền truy cập để đảm bảo chỉ những người dùng hợp lệ mới có thể tiếp cận nội dung.

### 2.2.3 Biểu đồ phân rã Use Case "Tìm kiếm truyện"

Chức năng Tìm kiếm truyện là điểm chạm quan trọng quyết định khả năng khám phá nội dung của người dùng, và được phân rã thành các hình thức tìm kiếm bổ trợ lẫn nhau như mô tả trong Hình 2.3. Hình thức cơ bản nhất là gợi ý tự động khi gõ, trong đó hệ thống hiển thị danh sách các truyện có khả năng phù hợp ngay khi người dùng nhập những ký tự đầu tiên vào ô tìm kiếm. Tính năng này giúp người dùng định hướng nhanh và tiết kiệm thao tác, dựa trên cơ chế khớp tiền tố trên tên truyện kết hợp với khớp mờ trên tên tác giả và thể loại.

> **[Hình 2.3: Biểu đồ phân rã Use Case "Tìm kiếm truyện"]**

Hình thức tìm kiếm trọng tâm là tìm kiếm toàn văn kết hợp với tìm kiếm ngữ nghĩa, được thiết kế theo nhiều tầng ưu tiên nhằm tối đa hóa độ chính xác. Khi người dùng nhập một truy vấn, hệ thống trước tiên ưu tiên tìm kiếm theo cụm từ chính xác trên tên truyện để phục vụ những người đã biết rõ tên bộ truyện cần tìm. Nếu không có kết quả khớp chính xác, hệ thống chuyển sang cơ chế tìm kiếm lai, kết hợp giữa tìm kiếm theo véc-tơ ngữ nghĩa và tìm kiếm theo từ khóa có khả năng chịu lỗi chính tả. Tìm kiếm theo véc-tơ ngữ nghĩa cho phép hệ thống nắm bắt được ý định mô tả của người dùng, trả về những bộ truyện gần gũi về mặt nội dung ngay cả khi truy vấn không chứa từ khóa khớp trực tiếp, qua đó giải quyết triệt để hạn chế cốt lõi của các nền tảng truyền thống.

Bên cạnh tìm kiếm tự do, hệ thống còn cung cấp tìm kiếm kết hợp lọc nâng cao, cho phép người dùng thu hẹp phạm vi theo thể loại, trạng thái hoàn thành, độ dài truyện và sắp xếp kết quả theo các tiêu chí như mới nhất, lượt xem hoặc đánh giá. Các điều kiện lọc phức tạp này được xử lý trực tiếp trên cơ sở dữ liệu quan hệ nhằm đảm bảo tính chính xác tuyệt đối của các phép thống kê và ràng buộc. Toàn bộ kiến trúc tìm kiếm được bao bọc bởi một cơ chế dự phòng nhiều lớp: khi hạ tầng tìm kiếm chuyên dụng gặp sự cố, hệ thống tự động chuyển sang truy vấn trực tiếp trên cơ sở dữ liệu quan hệ, đảm bảo chức năng tìm kiếm không bao giờ bị gián đoạn hoàn toàn dù chất lượng kết quả có thể giảm nhẹ.

### 2.2.4 Biểu đồ phân rã Use Case "Trợ lý AI"

Lớp tính năng trí tuệ nhân tạo là đóng góp nổi bật nhất của hệ thống và được phân rã thành ba chức năng con có liên hệ chặt chẽ với nhau như minh họa ở Hình 2.4. Chức năng đầu tiên là tóm tắt truyện tự động, cho phép người dùng nhanh chóng nắm bắt cốt truyện của một bộ truyện mà không cần đọc lại từ đầu. Khi người dùng yêu cầu tóm tắt, hệ thống kiểm tra xem bản tóm tắt đã tồn tại trong cơ sở dữ liệu hay chưa; nếu đã có, hệ thống trả về ngay để tiết kiệm chi phí gọi mô hình, còn nếu chưa, hệ thống gửi thông tin truyện tới mô hình ngôn ngữ để sinh bản tóm tắt cô đọng và lưu lại cho các lần sau. Quá trình sinh tóm tắt được ràng buộc bởi nguyên tắc không suy đoán nội dung và không tiết lộ kết truyện, đảm bảo an toàn cho trải nghiệm của độc giả.

> **[Hình 2.4: Biểu đồ phân rã Use Case "Trợ lý AI"]**

Chức năng thứ hai là trợ lý trò chuyện theo ngữ cảnh truyện, hoạt động dưới dạng một cửa sổ chat nổi trên trang đọc. Khi người dùng đặt câu hỏi, hệ thống tự động nhúng vào ngữ cảnh các thông tin của bộ truyện đang đọc bao gồm tên, tác giả, thể loại, mô tả, bản tóm tắt và tiến độ đọc hiện tại của người dùng. Nhờ ngữ cảnh phong phú này, trợ lý có thể trả lời các thắc mắc một cách bám sát nội dung, đồng thời tôn trọng tiến độ đọc bằng cách không tiết lộ tình tiết của những chương mà người dùng chưa đọc tới. Toàn bộ cuộc trò chuyện được truyền theo cơ chế phát trực tuyến để người dùng thấy được phản hồi xuất hiện dần theo thời gian thực, và lịch sử trò chuyện được lưu lại nhằm duy trì mạch ngữ cảnh qua nhiều lượt tương tác.

Chức năng thứ ba là trợ lý thư viện kèm khả năng gợi ý chủ động. Ở chế độ này, trợ lý đóng vai trò như một thủ thư am hiểu toàn bộ kho truyện, sẵn sàng giúp người dùng tìm kiếm dựa trên mô tả tự do về loại truyện họ muốn đọc. Điểm đặc biệt là trợ lý có khả năng tự nhận diện ý định tìm kiếm trong câu nói của người dùng, sau đó chủ động gọi công cụ tìm kiếm ngữ nghĩa để truy xuất các bộ truyện phù hợp từ thư viện, rồi giới thiệu lại một cách tự nhiên kèm theo các thẻ truyện trực quan. Cả hai chế độ trò chuyện đều được cá nhân hóa dựa trên các thể loại mà người dùng thường đọc, giúp các gợi ý ngày càng sát với sở thích thực sự của từng cá nhân.

### 2.2.5 Biểu đồ phân rã Use Case "Quản lý truyện"

Để đảm bảo kho nội dung luôn phong phú và được kiểm soát chặt chẽ, Use Case mức cao Quản lý truyện dành cho tác nhân Quản trị viên được phân rã thành các chức năng nghiệp vụ con tuân theo vòng đời của một bộ truyện, như minh họa ở Hình 2.5. Chức năng đầu tiên và mang tính nền tảng là thu thập truyện từ nguồn bên ngoài. Quản trị viên cung cấp địa chỉ nguồn, hệ thống tiến hành thu thập thông tin tổng quan của bộ truyện cùng danh sách các chương, lưu vào cơ sở dữ liệu rồi đồng bộ sang hệ thống tìm kiếm. Quá trình thu thập được thiết kế đủ linh hoạt để xử lý cả các trang tĩnh thông thường lẫn các trang yêu cầu trình duyệt thực thi JavaScript thông qua cơ chế dự phòng phù hợp.

> **[Hình 2.5: Biểu đồ phân rã Use Case "Quản lý truyện"]**

Dựa trên kho truyện đã có, khi cần điều chỉnh thông tin của một bộ truyện cụ thể, Quản trị viên kích hoạt chức năng chỉnh sửa truyện. Chức năng này cho phép cập nhật các thông tin hiển thị như tên, tác giả, mô tả, thể loại và trạng thái hoàn thành. Một yêu cầu nghiệp vụ quan trọng tại bước này là mọi thay đổi đối với thông tin truyện đều phải được đồng bộ ngay lập tức sang hệ thống tìm kiếm chuyên dụng, nhằm đảm bảo dữ liệu tìm kiếm luôn nhất quán với dữ liệu gốc và không xảy ra tình trạng người dùng tìm thấy thông tin đã lỗi thời.

Cuối cùng, nhằm hỗ trợ việc làm sạch dữ liệu, hệ thống cung cấp chức năng xóa truyện. Đây là một thao tác có tính phá hủy cao, do đó được thiết kế với ràng buộc về quyền hạn nghiêm ngặt và cơ chế xác nhận bằng cửa sổ cảnh báo trước khi thực thi. Khi một bộ truyện bị xóa, hệ thống đảm bảo loại bỏ đồng bộ toàn bộ dữ liệu liên quan bao gồm các chương, nội dung ảnh và bản ghi trên hệ thống tìm kiếm, nhờ vào ràng buộc xóa lan truyền được thiết lập ở tầng cơ sở dữ liệu. Cơ chế này giúp ngăn chặn tình trạng dữ liệu mồ côi và duy trì tính toàn vẹn tham chiếu trong toàn hệ thống.

### 2.2.6 Biểu đồ phân rã Use Case "Quản lý người dùng"

Chức năng Quản lý người dùng là một trong những phân hệ quan trọng dành cho Quản trị viên, đóng vai trò cốt lõi trong việc duy trì trật tự và an toàn của hệ thống, được phân rã như mô tả ở Hình 2.6. Quy trình bắt đầu khi Quản trị viên truy cập vào giao diện quản lý, nơi hệ thống hiển thị danh sách tổng quan toàn bộ các tài khoản đang tồn tại kèm theo các thông tin định danh cơ bản và vai trò tương ứng. Tại đây, người quản lý có cái nhìn bao quát về quy mô cộng đồng người dùng và có thể nắm bắt được cơ cấu phân quyền trong hệ thống.

> **[Hình 2.6: Biểu đồ phân rã Use Case "Quản lý người dùng"]**

Để xử lý hiệu quả khối lượng lớn dữ liệu người dùng, hệ thống cung cấp công cụ tìm kiếm cho phép Quản trị viên nhanh chóng định vị một tài khoản cụ thể dựa trên tên đăng nhập hoặc địa chỉ thư điện tử. Sau khi xác định được đối tượng cần quản lý, Quản trị viên có thể thực hiện các tác động trực tiếp lên tài khoản nhằm đảm bảo tính chính xác và tuân thủ quy định của nền tảng. Các thao tác này bao gồm thêm tài khoản mới, cập nhật thông tin và vai trò của người dùng hiện có, cũng như xóa những tài khoản vi phạm hoặc không còn hợp lệ.

Tổng hợp lại, quy trình quản lý người dùng tạo nên một vòng kiểm soát chặt chẽ từ khâu giám sát tổng quan đến các hành động can thiệp cụ thể. Việc tích hợp các chức năng xem, tìm kiếm, chỉnh sửa và xóa tài khoản vào một luồng nghiệp vụ thống nhất, kết hợp với cơ chế phân quyền nghiêm ngặt yêu cầu vai trò quản trị cho mọi thao tác, giúp người quản lý vừa hỗ trợ cộng đồng tốt hơn vừa chủ động bảo vệ an toàn cho hệ thống, qua đó đảm bảo một môi trường đọc truyện lành mạnh và đáng tin cậy.

### 2.2.7 Quy trình nghiệp vụ

Quy trình tìm kiếm và đọc truyện được mô tả trong Hình 2.7 là quy trình nghiệp vụ cốt lõi của hệ thống, thể hiện rõ sự phối hợp giữa các thành phần xử lý nhằm mang lại trải nghiệm vừa thông minh vừa hiệu quả về tài nguyên. Khác với mô hình truyền thống chỉ truy vấn cơ sở dữ liệu theo từ khóa, quy trình này áp dụng một kiến trúc xử lý phân tầng, trong đó mỗi loại truy vấn được định tuyến đến cơ chế phù hợp nhất, đồng thời tận dụng lưu đệm để tối ưu hóa việc phục vụ nội dung.

Quy trình bắt đầu khi người dùng nhập một truy vấn tìm kiếm. Hệ thống trước tiên đánh giá tính chất của truy vấn để lựa chọn cơ chế xử lý: nếu là một truy vấn văn bản thuần túy và hạ tầng tìm kiếm chuyên dụng đang hoạt động, hệ thống ưu tiên định tuyến tới cơ chế tìm kiếm toàn văn kết hợp ngữ nghĩa; ngược lại, nếu truy vấn đi kèm các điều kiện lọc phức tạp hoặc hạ tầng tìm kiếm gặp sự cố, hệ thống chuyển sang truy vấn trực tiếp trên cơ sở dữ liệu quan hệ. Tầng tìm kiếm chuyên dụng tự nó cũng vận hành theo nhiều bước ưu tiên, lần lượt thử khớp cụm từ chính xác, rồi tới tìm kiếm lai kết hợp véc-tơ ngữ nghĩa và từ khóa, nhằm đảm bảo luôn trả về kết quả phù hợp nhất với ý định của người dùng.

Sau khi nhận được danh sách kết quả, người dùng chọn một bộ truyện và một chương cụ thể để bắt đầu đọc, mở ra giai đoạn phục vụ nội dung. Tại giai đoạn này, hệ thống kiểm tra trạng thái lưu đệm của chương được yêu cầu. Nếu nội dung ảnh của chương đã tồn tại trong cơ sở dữ liệu, hệ thống trả về tức thì để người dùng có thể đọc ngay mà không phải chờ đợi. Nếu chương được truy cập lần đầu, hệ thống kích hoạt quá trình thu thập theo nhu cầu, tải ảnh từ nguồn bên ngoài, lưu lại vào cơ sở dữ liệu rồi mới trả về. Nhờ đó, chi phí thu thập chỉ phát sinh một lần duy nhất cho mỗi chương, trong khi mọi lượt đọc tiếp theo đều được phục vụ với tốc độ cao.

Giai đoạn cuối cùng của quy trình là ghi nhận tương tác và cá nhân hóa. Đối với người dùng đã đăng nhập, hệ thống ghi lại lịch sử đọc đồng thời cập nhật dữ liệu phục vụ cho các cơ chế thông minh phía sau. Lịch sử đọc trở thành cơ sở để hệ thống suy ra các thể loại ưa thích, từ đó tinh chỉnh kết quả gợi ý truyện và làm giàu ngữ cảnh cho trợ lý AI. Tổng thể, quy trình này tạo nên một vòng khép kín: người dùng tìm kiếm và đọc, hệ thống học hỏi từ hành vi đó để phục vụ ngày càng tốt hơn trong những lần tương tác tiếp theo, qua đó hiện thực hóa mục tiêu xây dựng một nền tảng đọc truyện thông minh và lấy người dùng làm trung tâm.

> **[Hình 2.7: Quy trình nghiệp vụ tìm kiếm và đọc truyện]**

## 2.3 Đặc tả chức năng

### 2.3.1 Đặc tả Use Case "Đọc truyện"

Bảng 2.1 dưới đây mô tả luồng sự kiện chính của Use Case "Đọc truyện". Đây là quy trình nghiệp vụ trọng tâm của hệ thống, đóng vai trò quyết định trong việc mang lại trải nghiệm đọc liền mạch đồng thời tối ưu hóa việc sử dụng tài nguyên thông qua cơ chế thu thập theo nhu cầu và lưu đệm.

**Bảng 2.1: Đặc tả Use Case "Đọc truyện"**

| Mục | Nội dung |
|---|---|
| **Mã Use Case** | UC001 |
| **Tên Use Case** | Đọc truyện |
| **Tác nhân** | Khách, Độc giả |
| **Mục đích** | Đọc nội dung truyện theo từng chương |
| **Tiền điều kiện** | Truyện tồn tại trong hệ thống |

| STT | Thực hiện bởi | Hành động |
|---|---|---|
| 1 | Hệ thống | Hiển thị danh sách truyện |
| 2 | Người dùng | Chọn một bộ truyện |
| 3 | Hệ thống | Hiển thị thông tin chi tiết và danh sách chương |
| 4 | Người dùng | Chọn chương cần đọc |
| 5 | Hệ thống | Kiểm tra nội dung chương trong cơ sở dữ liệu |
| 6 | Hệ thống | Trả về và hiển thị danh sách ảnh của chương |
| 7 | Người dùng | Đọc nội dung và điều hướng giữa các chương |
| 8 | Hệ thống | Ghi nhận lịch sử đọc (nếu đã đăng nhập) |

| Luồng | STT | Thực hiện bởi | Hành động |
|---|---|---|---|
| **Thay thế** | 6a | Hệ thống | Chương chưa có nội dung — thu thập ảnh từ nguồn, lưu đệm rồi trả về |
| **Thay thế** | 7a | Hệ thống | Yêu cầu đăng nhập nếu truyện thuộc nhóm hạn chế |

| **Hậu điều kiện** | Lịch sử đọc của người dùng được cập nhật |
|---|---|

Dữ liệu đầu vào của Use Case này được đặc tả với các trường dữ liệu cần thiết như Bảng 2.2.

**Bảng 2.2: Đặc tả dữ liệu đầu vào - Đọc truyện**

| STT | Tên trường | Mô tả | Bắt buộc | Điều kiện | Ví dụ |
|---|---|---|---|---|---|
| 1 | story_id | Mã định danh truyện | Có | Số nguyên dương | 101 |
| 2 | chapter_id | Mã định danh chương | Có | Số nguyên dương | 2048 |
| 3 | chapter_num | Số thứ tự chương | Có | Số thực dương | 10.5 |

### 2.3.2 Đặc tả Use Case "Tìm kiếm truyện"

Bảng 2.3 đặc tả luồng sự kiện chính cho Use Case "Tìm kiếm truyện". Nội dung tập trung vào quy trình xử lý truy vấn nhiều tầng, kết hợp giữa tìm kiếm toàn văn, tìm kiếm ngữ nghĩa và cơ chế dự phòng nhằm đảm bảo trả về kết quả phù hợp nhất với ý định của người dùng trong mọi điều kiện vận hành.

**Bảng 2.3: Đặc tả Use Case "Tìm kiếm truyện"**

| Mục | Nội dung |
|---|---|
| **Mã Use Case** | UC002 |
| **Tên Use Case** | Tìm kiếm truyện |
| **Tác nhân** | Khách, Độc giả |
| **Mục đích** | Tìm truyện theo từ khóa hoặc mô tả ngữ nghĩa |
| **Tiền điều kiện** | Không |

| STT | Thực hiện bởi | Hành động |
|---|---|---|
| 1 | Người dùng | Nhập từ khóa hoặc mô tả vào ô tìm kiếm |
| 2 | Hệ thống | Hiển thị gợi ý tự động theo tiền tố |
| 3 | Người dùng | Gửi yêu cầu tìm kiếm (có thể kèm bộ lọc) |
| 4 | Hệ thống | Định tuyến truy vấn theo tính chất và trạng thái hạ tầng |
| 5 | Hệ thống | Khớp cụm từ chính xác trên tên truyện |
| 6 | Hệ thống | Tìm kiếm lai (véc-tơ ngữ nghĩa + từ khóa) nếu chưa có kết quả |
| 7 | Hệ thống | Trả về danh sách kết quả kèm phân trang |

| Luồng | STT | Thực hiện bởi | Hành động |
|---|---|---|---|
| **Thay thế** | 4a | Hệ thống | Có bộ lọc nâng cao — truy vấn trực tiếp trên cơ sở dữ liệu quan hệ |
| **Thay thế** | 4b | Hệ thống | Hạ tầng tìm kiếm gặp sự cố — tự động chuyển sang cơ sở dữ liệu dự phòng |
| **Thay thế** | 7a | Hệ thống | Hiển thị thông báo khi không có kết quả phù hợp |

| **Hậu điều kiện** | Không |
|---|---|

Các dữ liệu đầu vào cho Use Case này được trình bày ở Bảng 2.4.

**Bảng 2.4: Đặc tả dữ liệu đầu vào - Tìm kiếm truyện**

| STT | Tên trường | Mô tả | Bắt buộc | Điều kiện | Ví dụ |
|---|---|---|---|---|---|
| 1 | search | Từ khóa hoặc câu mô tả | Không | Là chuỗi | "phiêu lưu thế giới phép thuật" |
| 2 | genres | Danh sách thể loại lọc | Không | Mảng chuỗi | ["Hành động", "Phiêu lưu"] |
| 3 | status | Trạng thái truyện | Không | Chuỗi enum | "completed" |
| 4 | sort | Tiêu chí sắp xếp | Không | newest / views / rating / az | "views" |
| 5 | page | Số trang kết quả | Không | Số nguyên dương | 1 |

### 2.3.3 Đặc tả Use Case "Trợ lý AI"

Bảng 2.5 đặc tả luồng sự kiện chính cho Use Case "Trợ lý AI" ở chế độ trò chuyện theo ngữ cảnh truyện. Luồng này mô tả các bước tương tác giữa người dùng và trợ lý thông minh, từ khâu nhúng ngữ cảnh, nhận diện ý định tìm kiếm đến việc phản hồi theo cơ chế phát trực tuyến.

**Bảng 2.5: Đặc tả Use Case "Trợ lý AI"**

| Mục | Nội dung |
|---|---|
| **Mã Use Case** | UC003 |
| **Tên Use Case** | Trợ lý AI |
| **Tác nhân** | Độc giả |
| **Mục đích** | Hỗ trợ giải đáp và gợi ý truyện theo ngữ cảnh |
| **Tiền điều kiện** | Người dùng đã đăng nhập |

| STT | Thực hiện bởi | Hành động |
|---|---|---|
| 1 | Người dùng | Mở cửa sổ trò chuyện và gửi câu hỏi |
| 2 | Hệ thống | Kiểm tra giới hạn tần suất gửi tin |
| 3 | Hệ thống | Nạp ngữ cảnh truyện, lịch sử chat và sở thích người dùng |
| 4 | Hệ thống | Nhận diện ý định tìm kiếm trong câu hỏi |
| 5 | Hệ thống | Gọi công cụ tìm kiếm khi phát hiện ý định gợi ý |
| 6 | Hệ thống | Sinh phản hồi và truyền theo cơ chế phát trực tuyến |
| 7 | Hệ thống | Lưu lịch sử và hiển thị thẻ truyện gợi ý (nếu có) |

| Luồng | STT | Thực hiện bởi | Hành động |
|---|---|---|---|
| **Thay thế** | 2a | Hệ thống | Từ chối khi gửi tin quá nhanh hoặc chưa đăng nhập |
| **Thay thế** | 6a | Hệ thống | Thông báo lỗi khi mô hình không phản hồi |

| **Hậu điều kiện** | Lịch sử trò chuyện được lưu lại |
|---|---|

### 2.3.4 Đặc tả Use Case "Quản lý truyện"

Bảng 2.6 đặc tả luồng sự kiện chính cho Use Case "Quản lý truyện" dành cho Quản trị viên. Đây là trình tự tương tác chuẩn giữa Quản trị viên và hệ thống nhằm thực hiện các nghiệp vụ thu thập, cập nhật và loại bỏ truyện, đồng thời đảm bảo dữ liệu luôn được đồng bộ với hệ thống tìm kiếm.

**Bảng 2.6: Đặc tả Use Case "Quản lý truyện"**

| Mục | Nội dung |
|---|---|
| **Mã Use Case** | UC004 |
| **Tên Use Case** | Quản lý truyện |
| **Tác nhân** | Quản trị viên |
| **Mục đích** | Quản lý kho truyện trong hệ thống |
| **Tiền điều kiện** | Người dùng có vai trò quản trị |

| STT | Thực hiện bởi | Hành động |
|---|---|---|
| 1 | Quản trị viên | Chọn chức năng quản lý truyện |
| 2 | Hệ thống | Hiển thị danh sách truyện hiện có |
| 3 | Quản trị viên | Nhập địa chỉ nguồn để thu thập truyện mới |
| 4 | Hệ thống | Thu thập thông tin truyện và danh sách chương |
| 5 | Hệ thống | Lưu vào cơ sở dữ liệu và đồng bộ sang hệ thống tìm kiếm |
| 6 | Quản trị viên | Chỉnh sửa hoặc xóa một bộ truyện |
| 7 | Hệ thống | Cập nhật dữ liệu và đồng bộ thay đổi sang hệ thống tìm kiếm |

| Luồng | STT | Thực hiện bởi | Hành động |
|---|---|---|---|
| **Thay thế** | 4a | Hệ thống | Dùng cơ chế dự phòng cho trang nguồn yêu cầu JavaScript |
| **Thay thế** | 6a | Quản trị viên | Xác nhận qua cửa sổ cảnh báo trước khi xóa |

| **Hậu điều kiện** | Kho truyện và chỉ mục tìm kiếm được cập nhật đồng bộ |
|---|---|

Dưới đây là bảng dữ liệu đầu vào cho Use Case này.

**Bảng 2.7: Đặc tả dữ liệu đầu vào - Quản lý truyện**

| STT | Tên trường | Mô tả | Bắt buộc | Điều kiện | Ví dụ |
|---|---|---|---|---|---|
| 1 | url | Địa chỉ nguồn truyện cần thu thập | Có | Là chuỗi URL hợp lệ | https://nguon.example/truyen-abc |
| 2 | title | Tên truyện | Có | Là chuỗi | "Hành Trình Phép Thuật" |
| 3 | author | Tác giả | Không | Là chuỗi | "Nguyễn Văn A" |
| 4 | genres | Danh sách thể loại | Không | Mảng chuỗi | ["Phiêu lưu", "Giả tưởng"] |
| 5 | status | Trạng thái truyện | Không | Chuỗi | "ongoing" |

## 2.4 Yêu cầu phi chức năng

Bên cạnh các yêu cầu chức năng nghiệp vụ, hệ thống cần phải đáp ứng các tiêu chuẩn kỹ thuật về hiệu năng, độ tin cậy và trải nghiệm người dùng để đảm bảo khả năng vận hành ổn định trong thực tế.

### 2.4.1 Hiệu năng hệ thống

Yêu cầu tiên quyết về hiệu năng đối với hệ thống là khả năng phục vụ tìm kiếm và đọc truyện với độ trễ thấp ngay cả khi số lượng người dùng truy cập đồng thời tăng cao. Để đạt được mục tiêu này, hệ thống ưu tiên sử dụng một hệ thống tìm kiếm chuyên dụng nhằm tăng tốc các truy vấn toàn văn và ngữ nghĩa thay vì quét trực tiếp trên cơ sở dữ liệu quan hệ. Bên cạnh đó, cơ chế thu thập theo nhu cầu kết hợp lưu đệm nội dung chương giúp giảm thiểu đáng kể chi phí xử lý lặp lại, đảm bảo những nội dung phổ biến luôn được phục vụ tức thì. Hệ thống cũng áp dụng kỹ thuật nạp dữ liệu song song cho các tác vụ độc lập và lưu đệm ngắn hạn cho các thông tin ít biến đổi nhằm rút ngắn thời gian phản hồi tổng thể.

### 2.4.2 Độ tin cậy và toàn vẹn dữ liệu

Về độ tin cậy, hệ thống cam kết duy trì hoạt động liên tục của chức năng tìm kiếm thông qua một kiến trúc dự phòng nhiều lớp. Khi hệ thống tìm kiếm chuyên dụng gặp sự cố, một cơ chế giám sát tự động phát hiện và chuyển hướng truy vấn sang cơ sở dữ liệu quan hệ, đảm bảo người dùng vẫn nhận được kết quả thay vì gặp lỗi hoàn toàn. Về toàn vẹn dữ liệu, mọi thao tác thêm, sửa và xóa truyện đều phải được đồng bộ nhất quán giữa cơ sở dữ liệu gốc và hệ thống tìm kiếm, tránh tình trạng dữ liệu sai lệch giữa hai nguồn. Hệ thống cũng áp dụng ràng buộc xóa lan truyền ở tầng cơ sở dữ liệu để bảo đảm khi một bộ truyện bị loại bỏ thì toàn bộ chương, nội dung ảnh và dữ liệu liên quan đều được dọn dẹp đồng bộ, qua đó loại trừ tình trạng dữ liệu mồ côi.

### 2.4.3 Trải nghiệm người dùng

Đối với trải nghiệm người dùng, hệ thống đặt ra tiêu chuẩn cao về tính phản hồi và sự thân thiện của giao diện. Các phản hồi của trợ lý AI được truyền theo cơ chế phát trực tuyến, cho phép người dùng thấy nội dung xuất hiện dần theo thời gian thực thay vì phải chờ toàn bộ câu trả lời được sinh xong, qua đó giảm thiểu cảm giác chờ đợi. Giao diện người dùng được thiết kế tương thích với nhiều loại thiết bị, từ máy tính cá nhân đến điện thoại di động, đảm bảo trải nghiệm đọc liền mạch trên mọi kích thước màn hình. Đặc biệt, mọi thao tác mang tính phá hủy hoặc khó hoàn tác đều được bảo vệ bằng cửa sổ cảnh báo xác nhận, giúp người dùng tránh các sai sót không mong muốn trong quá trình sử dụng.

### 2.4.4 Bảo mật và An toàn thông tin

Hệ thống phải thiết lập một hàng rào bảo mật nhiều lớp để bảo vệ thông tin người dùng và kiểm soát quyền truy cập tài nguyên. Mọi mật khẩu đều được mã hóa một chiều bằng thuật toán mạnh trước khi lưu trữ, tuyệt đối không lưu dưới dạng văn bản thuần. Cơ chế xác thực dựa trên thẻ phiên được lưu trong cookie an toàn, kết hợp với các tầng kiểm soát quyền hạn riêng biệt cho cả các trang giao diện lẫn các điểm truy cập dịch vụ, đảm bảo những chức năng quản trị chỉ có thể được thực hiện bởi tài khoản có vai trò phù hợp. Toàn bộ truy vấn tới cơ sở dữ liệu đều sử dụng tham số hóa nhằm phòng chống tấn công chèn câu lệnh, các thông tin nhạy cảm về cấu hình được tách khỏi mã nguồn, và thông báo lỗi trả về cho người dùng được giữ ở mức chung chung để không vô tình tiết lộ chi tiết kỹ thuật bên trong. Ngoài ra, các tính năng tương tác như trợ lý AI và bình luận được áp dụng cơ chế giới hạn tần suất nhằm ngăn chặn hành vi lạm dụng và bảo vệ tài nguyên hệ thống.

### 2.4.5 Khả năng bảo trì và Mở rộng

Mã nguồn hệ thống cần được tổ chức theo kiến trúc phân lớp rõ ràng, tách biệt giữa tầng định tuyến, tầng dịch vụ nghiệp vụ và tầng truy cập dữ liệu, để đảm bảo khả năng bảo trì và nâng cấp thuận tiện trong tương lai. Việc tách riêng các dịch vụ như tìm kiếm, sinh nội dung AI và sinh véc-tơ ngữ nghĩa thành các thành phần độc lập cho phép thay thế hoặc nâng cấp từng phần mà không ảnh hưởng đến toàn hệ thống. Hệ thống cũng được thiết kế theo định hướng sẵn sàng triển khai, với các tham số môi trường được tách biệt khỏi mã nguồn và hạ tầng phụ trợ được khai báo dưới dạng cấu hình, tạo điều kiện cho việc mở rộng quy mô và di chuyển giữa các môi trường một cách linh hoạt khi nhu cầu tăng trưởng.

## 2.5 Tổng kết chương

Chương 2 đã tiến hành khảo sát hiện trạng các nền tảng đọc truyện trực tuyến, chỉ ra ba hạn chế cốt lõi của các hệ thống hiện hành là năng lực tìm kiếm yếu kém chỉ dừng ở mức từ khóa, sự thiếu vắng các công cụ hỗ trợ thông minh trong hành trình đọc, và bài toán cân bằng tài nguyên trong khâu thu thập nội dung. Từ những hạn chế này, chương đã rút ra ba định hướng yêu cầu chính làm nền tảng cho toàn bộ đề tài: xây dựng năng lực tìm kiếm thông minh kết hợp toàn văn và ngữ nghĩa, tích hợp lớp trợ lý trí tuệ nhân tạo phục vụ tóm tắt, hỏi đáp và gợi ý, cùng cơ chế thu thập theo nhu cầu kết hợp lưu đệm.

Trên cơ sở các định hướng đó, chương đã mô hình hóa bài toán thông qua việc phân tích chi tiết ba tác nhân và các biểu đồ Use Case, làm rõ những quy trình nghiệp vụ cốt lõi như đọc truyện, tìm kiếm, tương tác với trợ lý AI và quản trị hệ thống. Bên cạnh đó, chương cũng thiết lập bộ tiêu chuẩn phi chức năng về hiệu năng, độ tin cậy, trải nghiệm người dùng, bảo mật và khả năng mở rộng. Những kết quả phân tích này đóng vai trò là bản thiết kế logic, là đầu vào không thể thiếu để tiến hành lựa chọn công nghệ và thiết kế kiến trúc hệ thống chi tiết trong các chương tiếp theo.
