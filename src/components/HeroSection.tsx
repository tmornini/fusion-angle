import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles } from "lucide-react";

const HeroSection = () => {
  return (
    <section className="relative min-h-screen flex items-center justify-center pt-20 overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 gradient-subtle" />
      
      {/* Decorative elements */}
      <div className="absolute top-1/4 left-10 w-72 h-72 bg-primary/5 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 right-10 w-96 h-96 bg-accent/10 rounded-full blur-3xl" />
      
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="max-w-4xl mx-auto text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-fusion-yellow-soft border border-accent/20 mb-8 animate-fade-in">
            <Sparkles className="w-4 h-4 text-accent-foreground" />
            <span className="text-sm font-medium text-accent-foreground">Human-Intelligence First</span>
          </div>

          {/* Heading */}
          <h1 className="font-display font-bold text-4xl sm:text-5xl lg:text-6xl xl:text-7xl text-foreground mb-6 animate-fade-in-up [animation-delay:100ms] opacity-0">
            AI That Amplifies{" "}
            <span className="text-primary">Human Intelligence</span>
          </h1>

          {/* Subheading */}
          <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 animate-fade-in-up [animation-delay:200ms] opacity-0">
            Fusion AI puts humans at the center. Our platform augments your expertise with intelligent automation, helping teams make better decisions faster.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-fade-in-up [animation-delay:300ms] opacity-0">
            <Button variant="accent" size="xl">
              Start Free Trial
              <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
            <Button variant="outline-hero" size="xl">
              Watch Demo
            </Button>
          </div>

          {/* Trust indicators */}
          <div className="mt-16 pt-8 border-t border-border/50 animate-fade-in-up [animation-delay:400ms] opacity-0">
            <p className="text-sm text-muted-foreground mb-6">Trusted by forward-thinking teams</p>
            <div className="flex flex-wrap items-center justify-center gap-8 opacity-60">
              {["TechCorp", "InnovateLab", "DataFlow", "NexGen", "Synergi"].map((company) => (
                <span key={company} className="text-lg font-display font-semibold text-muted-foreground">
                  {company}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
