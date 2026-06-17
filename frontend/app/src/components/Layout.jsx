import { Outlet } from 'react-router-dom';
import Header from './Header';
import Footer from './Footer';

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
