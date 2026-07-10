import { Outlet } from 'react-router-dom';
import Header from './Header';
import Footer from './Footer';

/**
 * Layout — Khung trang chung cho khu vực người đọc: Header trên cùng,
 * nội dung route con (<Outlet />) co giãn ở giữa, Footer dưới cùng
 * (flex-col + flex-1 giữ footer luôn chạm đáy kể cả trang ngắn).
 */
export default function Layout(props) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header {...props} />
      <div className="flex-1">
        <Outlet />
      </div>
      <Footer />
    </div>
  );
}
