export default function Footer({ simple = false }) {
  if (simple) {
    return (
      <footer className="bg-white border-t border-gray-200 py-4 text-center text-xs text-gray-400">
        <p>© 2025 <span className="font-semibold text-indigo-600">DH.story</span></p>
      </footer>
    );
  }

  return (
    <footer className="bg-white border-t border-gray-200 mt-10">
      <div className="container mx-auto py-6 px-6 flex flex-col md:flex-row justify-between items-center">
        <div className="flex items-center gap-2 mb-4 md:mb-0">
          <img src="/assets/images/Logo.png" alt="Logo" className="w-8 h-8 rounded-full" />
          <span className="font-bold text-indigo-600">DH.story</span>
        </div>
        <div className="text-center md:text-right text-xs text-gray-400">
          <p className="font-semibold text-gray-800 mb-1">LIÊN HỆ VỚI TÔI</p>
          <a
            href="https://github.com/JahyuniJo"
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center md:justify-end gap-2 hover:text-indigo-600"
          >
            <span>Github</span>
            <img src="/assets/images/Github.jpg" alt="Github" className="w-5 h-5 rounded-full" />
          </a>
          <p>
            Email:{' '}
            <a href="mailto:dieu300504@gmail.com" className="hover:text-indigo-600">
              dieu300504@gmail.com
            </a>
          </p>
          <p className="mt-2">Copyright © 2025 DieuHoang</p>
        </div>
      </div>
    </footer>
  );
}
