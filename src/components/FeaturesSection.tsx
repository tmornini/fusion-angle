import { Brain, Users, Zap, Shield, LineChart, MessageSquare } from "lucide-react";

const features = [
  {
    icon: Brain,
    title: "Intelligent Augmentation",
    description: "AI that learns from your expertise and amplifies your decision-making capabilities without replacing human judgment.",
  },
  {
    icon: Users,
    title: "Collaborative Workflows",
    description: "Seamlessly integrate AI assistance into your team's existing processes with human oversight at every step.",
  },
  {
    icon: Zap,
    title: "Real-Time Insights",
    description: "Get instant analysis and recommendations while maintaining full control over the final decisions.",
  },
  {
    icon: Shield,
    title: "Enterprise Security",
    description: "Bank-grade encryption and compliance with SOC 2, GDPR, and HIPAA requirements built-in.",
  },
  {
    icon: LineChart,
    title: "Transparent Analytics",
    description: "Understand how AI arrives at its suggestions with clear explanations and confidence scores.",
  },
  {
    icon: MessageSquare,
    title: "Natural Communication",
    description: "Interact with AI using natural language. No technical expertise required to get powerful results.",
  },
];

const FeaturesSection = () => {
  return (
    <section id="features" className="py-24 lg:py-32 bg-background">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="max-w-3xl mx-auto text-center mb-16">
          <h2 className="font-display font-bold text-3xl sm:text-4xl lg:text-5xl text-foreground mb-4">
            Built for the Way You Work
          </h2>
          <p className="text-lg text-muted-foreground">
            Powerful AI capabilities designed around human needs, not the other way around.
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
          {features.map((feature, index) => (
            <div
              key={feature.title}
              className="fusion-card p-6 lg:p-8 group"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-5 group-hover:bg-primary/20 transition-colors">
                <feature.icon className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-display font-semibold text-xl text-foreground mb-3">
                {feature.title}
              </h3>
              <p className="text-muted-foreground leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FeaturesSection;
