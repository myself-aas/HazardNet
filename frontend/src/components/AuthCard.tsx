
interface AuthCardProps {
  children: React.ReactNode;
  title?: string;
}

export const AuthCard: React.FC<AuthCardProps> = ({ children, title }) => {
  return (
    <div className="flex flex-col items-center justify-center min-h-dvh bg-carbon-05/80 p-4 sm:p-6">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl hover:shadow-2xl transition-all duration-300 p-6 sm:p-8 space-y-6 border border-carbon-20/90 relative overflow-hidden group">
        <div className="absolute top-0 left-0 w-full h-1 bg-nasa-red"></div>
        {title && (
          <div className="text-center space-y-1">
            <h2 className="text-2xl font-black text-carbon-90 tracking-tight">{title}</h2>
            <div className="w-12 h-1 bg-nasa-red/40 rounded-full mx-auto mt-2"></div>
          </div>
        )}
        {children}
      </div>
    </div>
  );
};

