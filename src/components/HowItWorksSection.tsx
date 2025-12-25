import { Check } from "lucide-react";

const steps = [
  {
    number: "01",
    title: "Connect Your Data",
    description: "Securely integrate with your existing tools and data sources. Our platform adapts to your infrastructure.",
    points: ["One-click integrations", "Enterprise SSO", "Custom API support"],
  },
  {
    number: "02",
    title: "Configure Your Workflows",
    description: "Set up AI-assisted processes that match your team's needs with human checkpoints where they matter.",
    points: ["Visual workflow builder", "Role-based permissions", "Audit trails"],
  },
  {
    number: "03",
    title: "Amplify Your Team",
    description: "Let AI handle routine tasks while your team focuses on high-value decisions and creative work.",
    points: ["Real-time collaboration", "Smart recommendations", "Continuous learning"],
  },
];

const HowItWorksSection = () => {
  return (
    <section id="how-it-works" className="py-24 lg:py-32 bg-fusion-blue-lightest">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="max-w-3xl mx-auto text-center mb-16">
          <h2 className="font-display font-bold text-3xl sm:text-4xl lg:text-5xl text-foreground mb-4">
            Get Started in Minutes
          </h2>
          <p className="text-lg text-muted-foreground">
            A straightforward path from setup to value, with support at every step.
          </p>
        </div>

        {/* Steps */}
        <div className="max-w-4xl mx-auto space-y-8 lg:space-y-12">
          {steps.map((step, index) => (
            <div
              key={step.number}
              className="flex flex-col md:flex-row gap-6 lg:gap-10 items-start"
            >
              {/* Step Number */}
              <div className="flex-shrink-0">
                <div className="w-16 h-16 rounded-2xl gradient-hero flex items-center justify-center shadow-fusion-lg">
                  <span className="font-display font-bold text-xl text-primary-foreground">
                    {step.number}
                  </span>
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 fusion-card p-6 lg:p-8 bg-card">
                <h3 className="font-display font-semibold text-xl lg:text-2xl text-foreground mb-3">
                  {step.title}
                </h3>
                <p className="text-muted-foreground mb-5 leading-relaxed">
                  {step.description}
                </p>
                <ul className="space-y-2">
                  {step.points.map((point) => (
                    <li key={point} className="flex items-center gap-3 text-foreground">
                      <div className="w-5 h-5 rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0">
                        <Check className="w-3 h-3 text-accent-foreground" />
                      </div>
                      <span className="text-sm font-medium">{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default HowItWorksSection;
