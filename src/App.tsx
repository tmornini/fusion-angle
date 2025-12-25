import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Onboarding from "./pages/Onboarding";
import Dashboard from "./pages/Dashboard";
import Ideas from "./pages/Ideas";
import IdeaCreate from "./pages/IdeaCreate";
import IdeaScoring from "./pages/IdeaScoring";
import IdeaConvert from "./pages/IdeaConvert";
import Edge from "./pages/Edge";
import EdgeList from "./pages/EdgeList";
import Projects from "./pages/Projects";
import ProjectDetail from "./pages/ProjectDetail";
import EngineeringRequirements from "./pages/EngineeringRequirements";
import Team from "./pages/Team";
import Crunch from "./pages/Crunch";
import Flow from "./pages/Flow";
import Account from "./pages/Account";
import Profile from "./pages/Profile";
import CompanySettings from "./pages/CompanySettings";
import ManageUsers from "./pages/ManageUsers";
import ActivityFeed from "./pages/ActivityFeed";
import NotificationSettings from "./pages/NotificationSettings";
import IdeaReviewQueue from "./pages/IdeaReviewQueue";
import ApprovalDetail from "./pages/ApprovalDetail";
import DesignSystem from "./pages/DesignSystem";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/ideas" element={<Ideas />} />
            <Route path="/ideas/new" element={<IdeaCreate />} />
            <Route path="/ideas/:ideaId/score" element={<IdeaScoring />} />
            <Route path="/ideas/:ideaId/edge" element={<Edge />} />
            <Route path="/ideas/:ideaId/convert" element={<IdeaConvert />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/projects/:projectId" element={<ProjectDetail />} />
            <Route path="/projects/:projectId/engineering" element={<EngineeringRequirements />} />
            <Route path="/team" element={<Team />} />
            <Route path="/teams" element={<Team />} />
            <Route path="/edge" element={<EdgeList />} />
            <Route path="/crunch" element={<Crunch />} />
            <Route path="/flow" element={<Flow />} />
            <Route path="/account" element={<Account />} />
            <Route path="/account/profile" element={<Profile />} />
            <Route path="/account/company" element={<CompanySettings />} />
            <Route path="/account/users" element={<ManageUsers />} />
            <Route path="/account/activity" element={<ActivityFeed />} />
            <Route path="/account/notifications" element={<NotificationSettings />} />
            <Route path="/review" element={<IdeaReviewQueue />} />
            <Route path="/review/:id" element={<ApprovalDetail />} />
            <Route path="/design-system" element={<DesignSystem />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
