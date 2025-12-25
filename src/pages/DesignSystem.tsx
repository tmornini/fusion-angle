import { useState } from "react";
import { useTheme } from "next-themes";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Check, X, AlertTriangle, Info, Search, Plus, ArrowRight, Trash2, Sun, Moon, Monitor } from "lucide-react";
import { FormField } from "@/components/FormError";
import { 
  SystemError, 
  UploadError, 
  SaveError, 
  ConnectionError 
} from "@/components/SystemError";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const ColorSwatch = ({ name, variable, className }: { name: string; variable: string; className: string }) => (
  <div className="flex flex-col gap-2">
    <div className={`h-16 w-full rounded-lg border ${className}`} />
    <div className="text-sm font-medium">{name}</div>
    <code className="text-xs text-muted-foreground">{variable}</code>
  </div>
);

const TypographyRow = ({ label, className, sample }: { label: string; className: string; sample: string }) => (
  <div className="flex flex-col gap-1 py-3 border-b border-border last:border-0">
    <code className="text-xs text-muted-foreground">{label}</code>
    <p className={className}>{sample}</p>
  </div>
);

export default function DesignSystem() {
  const { theme, setTheme } = useTheme();
  const [isRetrying, setIsRetrying] = useState(false);
  const [formErrors, setFormErrors] = useState({
    title: 'Please enter a title for your idea',
    email: 'This doesn\'t look like a valid email address',
    description: ''
  });

  const handleRetry = () => {
    setIsRetrying(true);
    setTimeout(() => setIsRetrying(false), 2000);
  };

  return (
    <DashboardLayout>
      <div className="space-y-12 pb-16">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground font-display">Fusion AI Design System</h1>
            <p className="text-muted-foreground mt-2">
              A production-ready design system for enterprise applications prioritizing clarity, trust, focus, and calm decision-making.
            </p>
          </div>
          
          {/* Theme Toggle */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                {theme === 'dark' ? (
                  <Moon className="w-4 h-4" />
                ) : theme === 'light' ? (
                  <Sun className="w-4 h-4" />
                ) : (
                  <Monitor className="w-4 h-4" />
                )}
                <span className="hidden sm:inline">
                  {theme === 'dark' ? 'Dark' : theme === 'light' ? 'Light' : 'System'}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setTheme('light')} className="gap-2">
                <Sun className="w-4 h-4" />
                Light
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTheme('dark')} className="gap-2">
                <Moon className="w-4 h-4" />
                Dark
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTheme('system')} className="gap-2">
                <Monitor className="w-4 h-4" />
                System
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <Separator />

        {/* Colors - Primary */}
        <section className="space-y-6">
          <div>
            <h2 className="text-2xl font-semibold text-foreground font-display">Brand Colors</h2>
            <p className="text-muted-foreground mt-1">Primary brand colors for Fusion AI</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-6">
            <ColorSwatch name="Primary Blue" variable="--primary" className="bg-primary" />
            <ColorSwatch name="Primary Foreground" variable="--primary-foreground" className="bg-primary-foreground border-2" />
            <ColorSwatch name="Accent Yellow" variable="--accent" className="bg-accent" />
            <ColorSwatch name="Accent Foreground" variable="--accent-foreground" className="bg-accent-foreground" />
          </div>
        </section>

        {/* Colors - Blue Scale */}
        <section className="space-y-6">
          <div>
            <h2 className="text-2xl font-semibold text-foreground font-display">Blue Scale</h2>
            <p className="text-muted-foreground mt-1">Derived from Primary Blue #4B6CA1</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-10 gap-4">
            <ColorSwatch name="50" variable="blue-50" className="bg-blue-50" />
            <ColorSwatch name="100" variable="blue-100" className="bg-blue-100" />
            <ColorSwatch name="200" variable="blue-200" className="bg-blue-200" />
            <ColorSwatch name="300" variable="blue-300" className="bg-blue-300" />
            <ColorSwatch name="400" variable="blue-400" className="bg-blue-400" />
            <ColorSwatch name="500" variable="blue-500" className="bg-blue-500" />
            <ColorSwatch name="600" variable="blue-600" className="bg-blue-600" />
            <ColorSwatch name="700" variable="blue-700" className="bg-blue-700" />
            <ColorSwatch name="800" variable="blue-800" className="bg-blue-800" />
            <ColorSwatch name="900" variable="blue-900" className="bg-blue-900" />
          </div>
        </section>

        {/* Colors - Semantic */}
        <section className="space-y-6">
          <div>
            <h2 className="text-2xl font-semibold text-foreground font-display">Semantic Colors</h2>
            <p className="text-muted-foreground mt-1">Status and feedback colors (WCAG AA compliant)</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
            <ColorSwatch name="Success" variable="--success" className="bg-success" />
            <ColorSwatch name="Warning" variable="--warning" className="bg-warning" />
            <ColorSwatch name="Destructive" variable="--destructive" className="bg-destructive" />
            <ColorSwatch name="Info" variable="--info" className="bg-info" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
            <ColorSwatch name="Success Soft" variable="--success-soft" className="bg-success-soft" />
            <ColorSwatch name="Warning Soft" variable="--warning-soft" className="bg-warning-soft" />
            <ColorSwatch name="Error Soft" variable="--error-soft" className="bg-error-soft" />
            <ColorSwatch name="Info Soft" variable="--info-soft" className="bg-info-soft" />
          </div>
        </section>

        {/* Colors - UI */}
        <section className="space-y-6">
          <div>
            <h2 className="text-2xl font-semibold text-foreground font-display">UI Colors</h2>
            <p className="text-muted-foreground mt-1">Background, surface, and border colors</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-6">
            <ColorSwatch name="Background" variable="--background" className="bg-background" />
            <ColorSwatch name="Foreground" variable="--foreground" className="bg-foreground" />
            <ColorSwatch name="Card" variable="--card" className="bg-card" />
            <ColorSwatch name="Muted" variable="--muted" className="bg-muted" />
            <ColorSwatch name="Border" variable="--border" className="bg-border" />
            <ColorSwatch name="Ring" variable="--ring" className="bg-ring" />
          </div>
        </section>

        <Separator />

        {/* Typography */}
        <section className="space-y-6">
          <div>
            <h2 className="text-2xl font-semibold text-foreground font-display">Typography</h2>
            <p className="text-muted-foreground mt-1">IBM Plex Sans for display, Inter for body text</p>
          </div>
          <Card>
            <CardContent className="pt-6">
              <TypographyRow label="text-4xl / font-display / font-bold" className="text-4xl font-display font-bold" sample="Hero Headlines" />
              <TypographyRow label="text-3xl / font-display / font-bold" className="text-3xl font-display font-bold" sample="Page Titles" />
              <TypographyRow label="text-2xl / font-semibold" className="text-2xl font-semibold" sample="Section Headers" />
              <TypographyRow label="text-xl / font-semibold" className="text-xl font-semibold" sample="Subsection Headers" />
              <TypographyRow label="text-lg / font-medium" className="text-lg font-medium" sample="Card Titles" />
              <TypographyRow label="text-base" className="text-base" sample="Body text for general content and descriptions" />
              <TypographyRow label="text-sm" className="text-sm" sample="Dense body text for tables and lists" />
              <TypographyRow label="text-xs" className="text-xs" sample="Labels and helper text" />
              <TypographyRow label="text-2xs" className="text-2xs" sample="Metadata and timestamps" />
              <TypographyRow label="font-mono / text-sm" className="font-mono text-sm" sample="const code = 'monospace';" />
            </CardContent>
          </Card>
        </section>

        <Separator />

        {/* Buttons */}
        <section className="space-y-6">
          <div>
            <h2 className="text-2xl font-semibold text-foreground font-display">Buttons</h2>
            <p className="text-muted-foreground mt-1">All button variants and sizes</p>
          </div>
          
          <Card>
            <CardHeader>
              <CardTitle>Variants</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-3">
                <Button variant="default">Default</Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="outline">Outline</Button>
                <Button variant="ghost">Ghost</Button>
                <Button variant="link">Link</Button>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button variant="destructive">Destructive</Button>
                <Button variant="success">Success</Button>
                <Button variant="accent">Accent</Button>
                <Button variant="hero">Hero</Button>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button variant="soft-primary">Soft Primary</Button>
                <Button variant="soft-success">Soft Success</Button>
                <Button variant="soft-warning">Soft Warning</Button>
                <Button variant="soft-destructive">Soft Destructive</Button>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button disabled>Disabled</Button>
                <Button variant="secondary" disabled>Disabled Secondary</Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Sizes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-center gap-3">
                <Button size="xs">Extra Small</Button>
                <Button size="sm">Small</Button>
                <Button size="default">Default</Button>
                <Button size="lg">Large</Button>
                <Button size="xl">Extra Large</Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>With Icons</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-3">
                <Button><Plus className="w-4 h-4 mr-2" /> Create</Button>
                <Button variant="secondary"><Search className="w-4 h-4 mr-2" /> Search</Button>
                <Button variant="outline">Continue <ArrowRight className="w-4 h-4 ml-2" /></Button>
                <Button variant="destructive"><Trash2 className="w-4 h-4 mr-2" /> Delete</Button>
                <Button variant="ghost" size="icon"><Plus className="w-4 h-4" /></Button>
              </div>
            </CardContent>
          </Card>
        </section>

        <Separator />

        {/* Badges */}
        <section className="space-y-6">
          <div>
            <h2 className="text-2xl font-semibold text-foreground font-display">Badges</h2>
            <p className="text-muted-foreground mt-1">Status indicators and labels</p>
          </div>
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="flex flex-wrap gap-3">
                <Badge>Default</Badge>
                <Badge variant="secondary">Secondary</Badge>
                <Badge variant="outline">Outline</Badge>
                <Badge variant="destructive">Destructive</Badge>
              </div>
              <div className="flex flex-wrap gap-3">
                <Badge variant="success"><Check className="w-3 h-3 mr-1" /> Approved</Badge>
                <Badge variant="warning"><AlertTriangle className="w-3 h-3 mr-1" /> Pending</Badge>
                <Badge variant="error"><X className="w-3 h-3 mr-1" /> Rejected</Badge>
                <Badge variant="info"><Info className="w-3 h-3 mr-1" /> Info</Badge>
              </div>
              <div className="flex flex-wrap gap-3">
                <Badge variant="soft-accent">Soft Accent</Badge>
              </div>
            </CardContent>
          </Card>
        </section>

        <Separator />

        {/* Form Elements */}
        <section className="space-y-6">
          <div>
            <h2 className="text-2xl font-semibold text-foreground font-display">Form Elements</h2>
            <p className="text-muted-foreground mt-1">Input fields and text areas</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Inputs</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Default Input</label>
                  <Input placeholder="Enter text..." />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">With Value</label>
                  <Input defaultValue="Sample content" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Error State</label>
                  <Input error placeholder="Invalid input" />
                  <p className="text-xs text-destructive">This field is required</p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Disabled</label>
                  <Input disabled placeholder="Disabled input" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Textareas</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Default Textarea</label>
                  <Textarea placeholder="Enter longer text..." />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Error State</label>
                  <Textarea error placeholder="Invalid content" />
                  <p className="text-xs text-destructive">Please provide more details</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        <Separator />

        {/* Cards */}
        <section className="space-y-6">
          <div>
            <h2 className="text-2xl font-semibold text-foreground font-display">Cards</h2>
            <p className="text-muted-foreground mt-1">Content containers with consistent styling</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="fusion-card">
              <CardHeader>
                <CardTitle>Fusion Card</CardTitle>
                <CardDescription>With hover effect</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">Hover over this card to see the subtle shadow effect.</p>
              </CardContent>
            </Card>
            <Card className="fusion-card-flat">
              <CardHeader>
                <CardTitle>Flat Card</CardTitle>
                <CardDescription>No hover effect</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">This card has no hover interaction, suitable for static content.</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Standard Card</CardTitle>
                <CardDescription>Default shadcn card</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">Basic card component from the UI library.</p>
              </CardContent>
            </Card>
          </div>
        </section>

        <Separator />

        {/* Spacing */}
        <section className="space-y-6">
          <div>
            <h2 className="text-2xl font-semibold text-foreground font-display">Spacing System</h2>
            <p className="text-muted-foreground mt-1">8pt grid for consistent spacing</p>
          </div>
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-3">
                {[
                  { name: "space-1", value: "4px", class: "w-1" },
                  { name: "space-2", value: "8px", class: "w-2" },
                  { name: "space-3", value: "12px", class: "w-3" },
                  { name: "space-4", value: "16px", class: "w-4" },
                  { name: "space-6", value: "24px", class: "w-6" },
                  { name: "space-8", value: "32px", class: "w-8" },
                  { name: "space-12", value: "48px", class: "w-12" },
                  { name: "space-16", value: "64px", class: "w-16" },
                ].map((space) => (
                  <div key={space.name} className="flex items-center gap-4">
                    <code className="text-xs text-muted-foreground w-20">{space.name}</code>
                    <div className={`h-4 bg-primary rounded ${space.class}`} />
                    <span className="text-sm text-muted-foreground">{space.value}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>

        <Separator />

        {/* Shadows */}
        <section className="space-y-6">
          <div>
            <h2 className="text-2xl font-semibold text-foreground font-display">Elevation & Shadows</h2>
            <p className="text-muted-foreground mt-1">Depth hierarchy for UI elements</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-6">
            {[
              { name: "shadow-xs", label: "Extra Small" },
              { name: "shadow-sm", label: "Small" },
              { name: "shadow-md", label: "Medium" },
              { name: "shadow-lg", label: "Large" },
              { name: "shadow-xl", label: "Extra Large" },
            ].map((shadow) => (
              <div key={shadow.name} className="flex flex-col items-center gap-3">
                <div className={`w-20 h-20 bg-card rounded-lg ${shadow.name}`} />
                <code className="text-xs text-muted-foreground">{shadow.name}</code>
                <span className="text-sm">{shadow.label}</span>
              </div>
            ))}
          </div>
        </section>

        <Separator />

        {/* Icons */}
        <section className="space-y-6">
          <div>
            <h2 className="text-2xl font-semibold text-foreground font-display">Iconography</h2>
            <p className="text-muted-foreground mt-1">Lucide React icons - simple, line-based, clear at small sizes</p>
          </div>
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-4">
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-2">
                    <Plus className="w-4 h-4" />
                    <span className="text-sm">16px (inline)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Plus className="w-5 h-5" />
                    <span className="text-sm">20px (buttons)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Plus className="w-6 h-6" />
                    <span className="text-sm">24px (standalone)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Plus className="w-12 h-12 text-muted-foreground" />
                    <span className="text-sm">48px (empty states)</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        <Separator />

        {/* Guidelines */}
        <section className="space-y-6">
          <div>
            <h2 className="text-2xl font-semibold text-foreground font-display">Usage Guidelines</h2>
            <p className="text-muted-foreground mt-1">Do's and don'ts for the design system</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="border-success-border bg-success-soft/30">
              <CardHeader>
                <CardTitle className="text-success-text flex items-center gap-2">
                  <Check className="w-5 h-5" /> Do
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p>✓ Use semantic color tokens, not raw hex values</p>
                <p>✓ Maintain consistent spacing with the 8pt grid</p>
                <p>✓ Ensure all interactive elements have focus states</p>
                <p>✓ Use the proper typography scale for hierarchy</p>
                <p>✓ Test contrast ratios for accessibility</p>
              </CardContent>
            </Card>
            <Card className="border-error-border bg-error-soft/30">
              <CardHeader>
                <CardTitle className="text-error-text flex items-center gap-2">
                  <X className="w-5 h-5" /> Don't
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p>✗ Use pure black (#000) for text</p>
                <p>✗ Create custom colors outside the system</p>
                <p>✗ Use decorative animations</p>
                <p>✗ Skip focus states on interactive elements</p>
                <p>✗ Mix typography scales inconsistently</p>
              </CardContent>
            </Card>
          </div>
        </section>

        <Separator />

        {/* Error States */}
        <section className="space-y-6">
          <div>
            <h2 className="text-2xl font-semibold text-foreground font-display">Error & System States</h2>
            <p className="text-muted-foreground mt-1">Clear, calm, and helpful error messaging</p>
          </div>

          {/* Inline Validation Errors */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Inline Validation Errors</CardTitle>
              <CardDescription>
                Form validation with helpful, non-blaming messages
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField 
                label="Idea Title" 
                error={formErrors.title}
                required
              >
                <Input placeholder="Enter a descriptive title" />
              </FormField>

              <FormField 
                label="Your Email" 
                error={formErrors.email}
                required
                hint="We'll use this to send you updates"
              >
                <Input type="email" placeholder="name@company.com" />
              </FormField>

              <FormField 
                label="Description" 
                error={formErrors.description}
                hint="Describe your idea in detail"
              >
                <Textarea placeholder="What problem does this solve?" rows={3} />
              </FormField>

              <div className="flex gap-2 pt-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setFormErrors({
                    title: 'Please enter a title for your idea',
                    email: 'This doesn\'t look like a valid email address',
                    description: 'Please add a brief description'
                  })}
                >
                  Show All Errors
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setFormErrors({ title: '', email: '', description: '' })}
                >
                  Clear Errors
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Upload Error */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Upload Failed</CardTitle>
                <CardDescription>
                  When a file upload doesn't complete
                </CardDescription>
              </CardHeader>
              <CardContent>
                <UploadError 
                  fileName="Q4_Sales_Report.xlsx"
                  onRetry={handleRetry}
                  onCancel={() => {}}
                  isRetrying={isRetrying}
                />
              </CardContent>
            </Card>

            {/* Save Error */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Save Failed</CardTitle>
                <CardDescription>
                  When changes couldn't be saved
                </CardDescription>
              </CardHeader>
              <CardContent>
                <SaveError 
                  onRetry={handleRetry}
                  onDiscard={() => {}}
                  isRetrying={isRetrying}
                />
              </CardContent>
            </Card>

            {/* Connection Error */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Connection Issue</CardTitle>
                <CardDescription>
                  When there's a network problem
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ConnectionError 
                  onRetry={handleRetry}
                  isRetrying={isRetrying}
                />
              </CardContent>
            </Card>

            {/* Inline System Error */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Inline System Error</CardTitle>
                <CardDescription>
                  Compact error for inline contexts
                </CardDescription>
              </CardHeader>
              <CardContent>
                <SystemError 
                  title="Couldn't load comments"
                  message="We'll try again automatically"
                  onRetry={handleRetry}
                  isRetrying={isRetrying}
                  variant="inline"
                />
              </CardContent>
            </Card>
          </div>

          {/* Full Page Error */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Full Page Error</CardTitle>
              <CardDescription>
                For critical failures that block progress
              </CardDescription>
            </CardHeader>
            <CardContent className="py-8 bg-muted/30 rounded-lg">
              <SystemError 
                title="Something went wrong"
                message="We couldn't complete your request. This might be a temporary issue — please try again in a moment."
                onRetry={handleRetry}
                onGoBack={() => {}}
                onGetHelp={() => {}}
                isRetrying={isRetrying}
              />
            </CardContent>
          </Card>
        </section>
      </div>
    </DashboardLayout>
  );
}
