import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Sparkles, ArrowRight } from 'lucide-react';

export default function Onboarding() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 rounded-2xl gradient-hero flex items-center justify-center mx-auto mb-6 shadow-fusion-lg">
          <Sparkles className="w-8 h-8 text-primary-foreground" />
        </div>
        <h1 className="text-3xl font-display font-bold text-foreground mb-3">
          Welcome to Fusion AI
        </h1>
        <p className="text-muted-foreground mb-8">
          Your workspace is ready. Start exploring ideas, managing projects, and collaborating with your team.
        </p>
        <Button 
          onClick={() => navigate('/dashboard')} 
          className="gap-2"
          size="lg"
        >
          Go to Dashboard
          <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
