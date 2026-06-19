import { Outlet } from 'react-router-dom';
import { motion } from 'framer-motion';
import Sidebar from './Sidebar';
import MobileNav from './MobileNav';
import TitleBar from './TitleBar';
import MobileHeader from './MobileHeader';

export default function MainLayout() {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <TitleBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">
          <MobileHeader />
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="mx-auto max-w-7xl px-4 py-5 sm:px-6 pb-24 md:pb-6"
          >
            <Outlet />
          </motion.div>
        </main>
      </div>
      <MobileNav />
    </div>
  );
}
