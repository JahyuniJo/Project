import { Outlet } from 'react-router-dom';
import Footer from './Footer';

export default function AuthLayout() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <main className="flex-grow flex justify-center items-center px-4 py-8">
        <Outlet />
      </main>
      <Footer simple />
    </div>
  );
}
