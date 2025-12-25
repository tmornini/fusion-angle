-- Phase 1: Core tables for workflow enforcement
-- Ideas table (the starting point)
CREATE TABLE public.ideas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  company_id UUID REFERENCES public.companies(id),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'edge_pending', 'under_review', 'approved', 'rejected', 'converted')),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Edge table (mandatory for approval)
CREATE TABLE public.edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id UUID NOT NULL REFERENCES public.ideas(id) ON DELETE CASCADE UNIQUE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'complete')),
  confidence_level TEXT CHECK (confidence_level IN ('low', 'medium', 'high')),
  owner TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Edge outcomes (business outcomes)
CREATE TABLE public.edge_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  edge_id UUID NOT NULL REFERENCES public.edges(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  impact_timeline TEXT CHECK (impact_timeline IN ('short', 'mid', 'long')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Edge metrics (KPIs)
CREATE TABLE public.edge_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  edge_id UUID NOT NULL REFERENCES public.edges(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  target_value NUMERIC,
  unit TEXT,
  current_value NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Crunch table (evidence attached to Edge)
CREATE TABLE public.crunches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  edge_id UUID NOT NULL REFERENCES public.edges(id) ON DELETE CASCADE UNIQUE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'complete')),
  summary TEXT,
  risks TEXT,
  assumptions TEXT,
  constraints TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Reviews table
CREATE TABLE public.reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id UUID NOT NULL REFERENCES public.ideas(id) ON DELETE CASCADE,
  reviewer_id UUID,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'changes_requested')),
  comments TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Projects table (from approved ideas)
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id UUID REFERENCES public.ideas(id),
  user_id UUID NOT NULL,
  company_id UUID REFERENCES public.companies(id),
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'planning' CHECK (status IN ('planning', 'in_progress', 'completed', 'on_hold', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Flow table (execution attached to projects)
CREATE TABLE public.flows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE UNIQUE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'complete')),
  current_process TEXT,
  future_process TEXT,
  bottlenecks TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Flow steps
CREATE TABLE public.flow_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id UUID NOT NULL REFERENCES public.flows(id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  owner TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'blocked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.ideas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.edge_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.edge_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crunches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flow_steps ENABLE ROW LEVEL SECURITY;

-- RLS Policies for Ideas
CREATE POLICY "Users can view own ideas" ON public.ideas FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own ideas" ON public.ideas FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own ideas" ON public.ideas FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own ideas" ON public.ideas FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for Edges (view through idea ownership)
CREATE POLICY "Users can view edges for own ideas" ON public.edges FOR SELECT 
  USING (EXISTS (SELECT 1 FROM public.ideas WHERE ideas.id = edges.idea_id AND ideas.user_id = auth.uid()));
CREATE POLICY "Users can insert edges for own ideas" ON public.edges FOR INSERT 
  WITH CHECK (EXISTS (SELECT 1 FROM public.ideas WHERE ideas.id = idea_id AND ideas.user_id = auth.uid()));
CREATE POLICY "Users can update edges for own ideas" ON public.edges FOR UPDATE 
  USING (EXISTS (SELECT 1 FROM public.ideas WHERE ideas.id = edges.idea_id AND ideas.user_id = auth.uid()));
CREATE POLICY "Users can delete edges for own ideas" ON public.edges FOR DELETE 
  USING (EXISTS (SELECT 1 FROM public.ideas WHERE ideas.id = edges.idea_id AND ideas.user_id = auth.uid()));

-- RLS Policies for Edge Outcomes
CREATE POLICY "Users can manage edge outcomes" ON public.edge_outcomes FOR ALL 
  USING (EXISTS (SELECT 1 FROM public.edges e JOIN public.ideas i ON e.idea_id = i.id WHERE e.id = edge_outcomes.edge_id AND i.user_id = auth.uid()));

-- RLS Policies for Edge Metrics
CREATE POLICY "Users can manage edge metrics" ON public.edge_metrics FOR ALL 
  USING (EXISTS (SELECT 1 FROM public.edges e JOIN public.ideas i ON e.idea_id = i.id WHERE e.id = edge_metrics.edge_id AND i.user_id = auth.uid()));

-- RLS Policies for Crunches
CREATE POLICY "Users can manage crunches" ON public.crunches FOR ALL 
  USING (EXISTS (SELECT 1 FROM public.edges e JOIN public.ideas i ON e.idea_id = i.id WHERE e.id = crunches.edge_id AND i.user_id = auth.uid()));

-- RLS Policies for Reviews
CREATE POLICY "Users can view reviews for own ideas" ON public.reviews FOR SELECT 
  USING (EXISTS (SELECT 1 FROM public.ideas WHERE ideas.id = reviews.idea_id AND ideas.user_id = auth.uid()));
CREATE POLICY "Users can manage reviews" ON public.reviews FOR ALL 
  USING (auth.uid() = reviewer_id OR EXISTS (SELECT 1 FROM public.ideas WHERE ideas.id = reviews.idea_id AND ideas.user_id = auth.uid()));

-- RLS Policies for Projects
CREATE POLICY "Users can view own projects" ON public.projects FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own projects" ON public.projects FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own projects" ON public.projects FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own projects" ON public.projects FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for Flows
CREATE POLICY "Users can manage flows for own projects" ON public.flows FOR ALL 
  USING (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = flows.project_id AND projects.user_id = auth.uid()));

-- RLS Policies for Flow Steps
CREATE POLICY "Users can manage flow steps" ON public.flow_steps FOR ALL 
  USING (EXISTS (SELECT 1 FROM public.flows f JOIN public.projects p ON f.project_id = p.id WHERE f.id = flow_steps.flow_id AND p.user_id = auth.uid()));

-- Triggers for updated_at
CREATE TRIGGER update_ideas_updated_at BEFORE UPDATE ON public.ideas FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_edges_updated_at BEFORE UPDATE ON public.edges FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_crunches_updated_at BEFORE UPDATE ON public.crunches FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_reviews_updated_at BEFORE UPDATE ON public.reviews FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_flows_updated_at BEFORE UPDATE ON public.flows FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_flow_steps_updated_at BEFORE UPDATE ON public.flow_steps FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();