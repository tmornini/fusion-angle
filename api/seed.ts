// ============================================
// FUSION AI — Seed Data
// Populates database with mock data on first run.
// ============================================

import type { DbAdapter } from './db';

export async function seedData(adapter: DbAdapter): Promise<void> {
  // ── Users ──────────────────────────────────
  const users = [
    { id: '1', first_name: 'Sarah', last_name: 'Chen', email: 'sarah.chen@company.com', role: 'Project Lead', department: 'Operations', status: 'available', availability: 85, performance_score: 94, projects_completed: 12, current_projects: 3, strengths: ['Strategic Planning', 'Team Leadership', 'Risk Management'], team_dimensions: { driver: 78, analytical: 85, expressive: 62, amiable: 70 }, phone: '', bio: '', last_active: '2 hours ago' },
    { id: '2', first_name: 'Mike', last_name: 'Thompson', email: 'mike.thompson@company.com', role: 'ML Engineer', department: 'Engineering', status: 'busy', availability: 60, performance_score: 91, projects_completed: 8, current_projects: 2, strengths: ['Machine Learning', 'Python', 'Data Architecture'], team_dimensions: { driver: 55, analytical: 95, expressive: 40, amiable: 58 }, phone: '', bio: '', last_active: '' },
    { id: '3', first_name: 'Jessica', last_name: 'Park', email: 'jessica.park@company.com', role: 'Data Scientist', department: 'Analytics', status: 'available', availability: 70, performance_score: 88, projects_completed: 6, current_projects: 2, strengths: ['Statistical Analysis', 'Visualization', 'Predictive Modeling'], team_dimensions: { driver: 45, analytical: 92, expressive: 68, amiable: 75 }, phone: '', bio: '', last_active: '1 hour ago' },
    { id: '4', first_name: 'David', last_name: 'Martinez', email: 'david.martinez@company.com', role: 'Backend Developer', department: 'Engineering', status: 'limited', availability: 40, performance_score: 86, projects_completed: 10, current_projects: 4, strengths: ['API Development', 'Database Design', 'System Integration'], team_dimensions: { driver: 70, analytical: 82, expressive: 35, amiable: 55 }, phone: '', bio: '', last_active: '4 hours ago' },
    { id: '5', first_name: 'Emily', last_name: 'Rodriguez', email: 'emily.rodriguez@company.com', role: 'UX Designer', department: 'Design', status: 'available', availability: 90, performance_score: 92, projects_completed: 15, current_projects: 1, strengths: ['User Research', 'Prototyping', 'Design Systems'], team_dimensions: { driver: 50, analytical: 72, expressive: 88, amiable: 85 }, phone: '', bio: '', last_active: '' },
    { id: '6', first_name: 'Alex', last_name: 'Kim', email: 'alex.kim@company.com', role: 'Product Manager', department: 'Product', status: 'busy', availability: 55, performance_score: 89, projects_completed: 7, current_projects: 3, strengths: ['Roadmap Planning', 'Stakeholder Management', 'Agile Methods'], team_dimensions: { driver: 85, analytical: 70, expressive: 78, amiable: 65 }, phone: '', bio: '', last_active: '' },
    { id: '7', first_name: 'Marcus', last_name: 'Johnson', email: 'marcus@acmecorp.com', role: 'manager', department: 'Product', status: 'active', availability: 80, performance_score: 85, projects_completed: 5, current_projects: 2, strengths: ['Product Strategy', 'Team Management'], team_dimensions: { driver: 75, analytical: 65, expressive: 80, amiable: 70 }, phone: '', bio: '', last_active: '30 min ago' },
    { id: '8', first_name: 'David', last_name: 'Kim', email: 'david.kim@company.com', role: 'member', department: 'Engineering', status: 'active', availability: 75, performance_score: 83, projects_completed: 4, current_projects: 2, strengths: ['Frontend Development', 'React', 'TypeScript'], team_dimensions: { driver: 60, analytical: 78, expressive: 55, amiable: 65 }, phone: '', bio: '', last_active: '' },
    { id: '9', first_name: 'Lisa', last_name: 'Wang', email: 'lisa@acmecorp.com', role: 'viewer', department: 'Sales', status: 'active', availability: 70, performance_score: 80, projects_completed: 3, current_projects: 1, strengths: ['Sales Strategy', 'Client Relations'], team_dimensions: { driver: 80, analytical: 55, expressive: 85, amiable: 75 }, phone: '', bio: '', last_active: '1 day ago' },
    { id: '10', first_name: 'James', last_name: 'Miller', email: 'james@acmecorp.com', role: 'member', department: 'Engineering', status: 'deactivated', availability: 0, performance_score: 78, projects_completed: 6, current_projects: 0, strengths: ['Backend Development', 'Python'], team_dimensions: { driver: 55, analytical: 82, expressive: 40, amiable: 50 }, phone: '', bio: '', last_active: '1 week ago' },
    { id: 'current', first_name: 'Demo', last_name: 'User', email: 'demo@example.com', role: 'Admin', department: 'Product', status: 'active', availability: 100, performance_score: 95, projects_completed: 20, current_projects: 5, strengths: ['Strategic Planning', 'Data Analysis', 'Stakeholder Management'], team_dimensions: { driver: 80, analytical: 80, expressive: 80, amiable: 80 }, phone: '+1 (555) 123-4567', bio: 'Passionate about building products that solve real problems.', last_active: '' },
  ];

  // Batch 1: Users (no foreign keys)
  await Promise.all(users.map(user =>
    adapter.users.put(user.id, {
      ...user,
      strengths: JSON.stringify(user.strengths),
      team_dimensions: JSON.stringify(user.team_dimensions),
    }),
  ));

  // ── Ideas ──────────────────────────────────
  const ideas = [
    { id: '1', title: 'AI-Powered Customer Segmentation', score: 92, estimated_impact: 85, estimated_time: 120, estimated_cost: 45000, priority: 1, status: 'pending_review', submitted_by_id: '1', edge_status: 'complete', problem_statement: 'Marketing team spends 20+ hours weekly manually segmenting customers, leading to delayed campaigns and missed opportunities.', proposed_solution: 'Implement machine learning model to automatically segment customers based on behavior patterns.', expected_outcome: 'Reduce segmentation time by 80% and increase conversion rates by 25%.', category: '', readiness: '', waiting_days: 0, impact_label: '', effort_label: '', description: '', submitted_at: '', risks: '[]', assumptions: '[]', alignments: '[]', effort_time_estimate: '', effort_team_size: '', cost_estimate: '', cost_breakdown: '' },
    { id: '2', title: 'Automated Report Generation', score: 87, estimated_impact: 78, estimated_time: 80, estimated_cost: 32000, priority: 2, status: 'approved', submitted_by_id: '2', edge_status: 'complete', problem_statement: 'Analysts spend 15+ hours per week manually compiling reports from multiple data sources, causing delays in decision-making.', proposed_solution: 'Build an automated pipeline that aggregates data sources and generates formatted reports on a schedule.', expected_outcome: 'Eliminate manual report assembly, freeing 15 analyst-hours weekly and reducing report delivery time from days to minutes.', category: '', readiness: '', waiting_days: 0, impact_label: '', effort_label: '', description: '', submitted_at: '', risks: '[]', assumptions: '[]', alignments: '[]', effort_time_estimate: '', effort_team_size: '', cost_estimate: '', cost_breakdown: '' },
    { id: '3', title: 'Predictive Maintenance System', score: 84, estimated_impact: 90, estimated_time: 200, estimated_cost: 75000, priority: 3, status: 'scored', submitted_by_id: '5', edge_status: 'draft', problem_statement: 'Unplanned equipment downtime costs $50K per incident and occurs 3-4 times per quarter due to reactive maintenance.', proposed_solution: 'Deploy IoT sensors with ML models to predict equipment failures 2-4 weeks before they occur.', expected_outcome: 'Reduce unplanned downtime by 70% and extend equipment lifespan by 20%, saving $150K annually.', category: '', readiness: '', waiting_days: 0, impact_label: '', effort_label: '', description: '', submitted_at: '', risks: '[]', assumptions: '[]', alignments: '[]', effort_time_estimate: '', effort_team_size: '', cost_estimate: '', cost_breakdown: '' },
    { id: '4', title: 'Real-time Analytics Dashboard', score: 81, estimated_impact: 72, estimated_time: 60, estimated_cost: 28000, priority: 4, status: 'pending_review', submitted_by_id: '8', edge_status: 'complete', problem_statement: 'Leadership relies on weekly batch reports that are outdated by the time they arrive, missing real-time trends.', proposed_solution: 'Create a live dashboard with streaming data pipelines, interactive filters, and automated anomaly alerts.', expected_outcome: 'Enable real-time decision-making, reducing response time to market changes from 5 days to under 1 hour.', category: '', readiness: '', waiting_days: 0, impact_label: '', effort_label: '', description: '', submitted_at: '', risks: '[]', assumptions: '[]', alignments: '[]', effort_time_estimate: '', effort_team_size: '', cost_estimate: '', cost_breakdown: '' },
    { id: '5', title: 'Smart Inventory Optimization', score: 78, estimated_impact: 68, estimated_time: 100, estimated_cost: 38000, priority: 5, status: 'draft', submitted_by_id: '9', edge_status: 'incomplete', problem_statement: 'Excess inventory ties up $2M in capital while stockouts cause 8% of orders to be delayed or cancelled.', proposed_solution: 'Implement demand forecasting with automatic reorder triggers based on seasonality, trends, and lead times.', expected_outcome: 'Reduce carrying costs by 30% and stockout incidents by 60%, improving customer satisfaction scores.', category: '', readiness: '', waiting_days: 0, impact_label: '', effort_label: '', description: '', submitted_at: '', risks: '[]', assumptions: '[]', alignments: '[]', effort_time_estimate: '', effort_team_size: '', cost_estimate: '', cost_breakdown: '' },
    { id: '6', title: 'Employee Training Assistant', score: 74, estimated_impact: 65, estimated_time: 90, estimated_cost: 35000, priority: 6, status: 'rejected', submitted_by_id: '3', edge_status: 'incomplete', problem_statement: 'New hire onboarding takes 6 weeks on average, with inconsistent training quality across departments.', proposed_solution: 'Build an AI training assistant that delivers personalized learning paths and answers procedural questions.', expected_outcome: 'Reduce onboarding time to 3 weeks and improve new hire productivity scores by 40% in the first quarter.', category: '', readiness: '', waiting_days: 0, impact_label: '', effort_label: '', description: '', submitted_at: '', risks: '[]', assumptions: '[]', alignments: '[]', effort_time_estimate: '', effort_team_size: '', cost_estimate: '', cost_breakdown: '' },
    // Review queue ideas
    { id: '7', title: 'AI-Powered Customer Support Chatbot', score: 87, estimated_impact: 0, estimated_time: 0, estimated_cost: 0, priority: 8, status: 'pending_review', submitted_by_id: '1', edge_status: 'complete', problem_statement: '', proposed_solution: '', expected_outcome: '', category: 'Customer Experience', readiness: 'ready', waiting_days: 3, impact_label: 'High', effort_label: 'Medium', description: 'Implement an intelligent chatbot using GPT-4 to handle tier-1 customer support inquiries. The system would integrate with our existing helpdesk platform and learn from historical ticket data to provide accurate, context-aware responses.', submitted_at: 'January 15, 2024', risks: JSON.stringify([
      { title: 'AI response accuracy', severity: 'high', mitigation: 'Implement human escalation for low-confidence responses and continuous training loop' },
      { title: 'Integration complexity', severity: 'medium', mitigation: 'Phase rollout starting with FAQ-only queries before expanding scope' },
      { title: 'Customer acceptance', severity: 'low', mitigation: 'Clear bot identification and easy handoff to human agents' },
    ]), assumptions: JSON.stringify([
      'Current helpdesk API supports required integrations',
      'Historical ticket data is clean and categorizable',
      'Legal has approved AI usage for customer interactions',
    ]), alignments: JSON.stringify([
      'Q1 OKR: Improve customer satisfaction score by 15%',
      'Digital transformation initiative',
      'Cost optimization program',
    ]), effort_time_estimate: '3-4 months', effort_team_size: '4-5 engineers', cost_estimate: '$120,000 - $150,000', cost_breakdown: 'Development: $80K, API costs: $20K/year, Training: $10K' },
    { id: '8', title: 'Mobile App Push Notification Revamp', score: 72, estimated_impact: 0, estimated_time: 0, estimated_cost: 0, priority: 10, status: 'pending_review', submitted_by_id: '7', edge_status: 'draft', problem_statement: '', proposed_solution: '', expected_outcome: '', category: 'Product', readiness: 'needs-info', waiting_days: 4, impact_label: 'Medium', effort_label: 'Low', description: '', submitted_at: '', risks: '[]', assumptions: '[]', alignments: '[]', effort_time_estimate: '', effort_team_size: '', cost_estimate: '', cost_breakdown: '' },
    { id: '9', title: 'Sustainability Dashboard for Operations', score: 81, estimated_impact: 0, estimated_time: 0, estimated_cost: 0, priority: 9, status: 'pending_review', submitted_by_id: '5', edge_status: 'complete', problem_statement: '', proposed_solution: '', expected_outcome: '', category: 'Operations', readiness: 'ready', waiting_days: 6, impact_label: 'High', effort_label: 'High', description: '', submitted_at: '', risks: '[]', assumptions: '[]', alignments: '[]', effort_time_estimate: '', effort_team_size: '', cost_estimate: '', cost_breakdown: '' },
    { id: '10', title: 'Employee Wellness Program Integration', score: 45, estimated_impact: 0, estimated_time: 0, estimated_cost: 0, priority: 11, status: 'pending_review', submitted_by_id: '8', edge_status: 'missing', problem_statement: '', proposed_solution: '', expected_outcome: '', category: 'HR', readiness: 'incomplete', waiting_days: 8, impact_label: 'Medium', effort_label: 'Medium', description: '', submitted_at: '', risks: '[]', assumptions: '[]', alignments: '[]', effort_time_estimate: '', effort_team_size: '', cost_estimate: '', cost_breakdown: '' },
    { id: '11', title: 'Real-time Inventory Tracking System', score: 91, estimated_impact: 0, estimated_time: 0, estimated_cost: 0, priority: 7, status: 'pending_review', submitted_by_id: '9', edge_status: 'complete', problem_statement: '', proposed_solution: '', expected_outcome: '', category: 'Operations', readiness: 'ready', waiting_days: 5, impact_label: 'High', effort_label: 'Medium', description: '', submitted_at: '', risks: '[]', assumptions: '[]', alignments: '[]', effort_time_estimate: '', effort_team_size: '', cost_estimate: '', cost_breakdown: '' },
  ];

  const categories = [
    { id: 'ideas', label: 'Ideas', icon: 'lightbulb' },
    { id: 'projects', label: 'Projects', icon: 'folderKanban' },
    { id: 'teams', label: 'Teams', icon: 'users' },
    { id: 'account', label: 'Account', icon: 'user' },
  ];

  // Batch 2: Ideas, processes, company settings, account, notification categories (reference users)
  await Promise.all([
    ...ideas.map(idea => adapter.ideas.put(idea.id, idea)),
    adapter.processes.put('1', {
      name: 'Customer Onboarding',
      description: 'End-to-end process for onboarding new enterprise customers',
      department: 'Customer Success',
    }),
    adapter.companySettings.put({
      name: 'Acme Corporation',
      domain: 'acmecorp.com',
      industry: 'Technology',
      size: '51-200',
      timezone: 'America/New_York',
      language: 'English',
      is_sso_enforced: 0,
      is_two_factor_enabled: 1,
      is_ip_whitelist_enabled: 0,
      data_retention: '12 months',
    }),
    adapter.account.put({
      plan: 'Business',
      plan_status: 'active',
      next_billing: '2025-01-15',
      seats: 25,
      used_seats: 18,
      projects_limit: 50,
      projects_current: 12,
      ideas_limit: 200,
      ideas_current: 47,
      storage_limit: 10,
      storage_current: 2.4,
      ai_credits_limit: 1000,
      ai_credits_current: 850,
      health_score: 92,
      health_status: 'excellent',
      last_activity: '2 hours ago',
      active_users: 14,
    }),
    ...categories.map(category => adapter.notificationCategories.put(category.id, category)),
  ]);

  // ── Projects ───────────────────────────────
  const projects = [
    { id: '1', title: 'AI-Powered Customer Segmentation', description: 'Implement machine learning model to automatically segment customers based on behavior, purchase history, and engagement patterns.', status: 'approved', progress: 72, start_date: '2024-01-15', target_end_date: '2024-04-15', lead_id: '1', estimated_time: 120, actual_time: 85, estimated_cost: 45000, actual_cost: 38000, estimated_impact: 85, actual_impact: 78, priority: 1, priority_score: 92, linked_idea_id: '1', business_context: JSON.stringify({ problem: "Current manual segmentation takes 2 weeks and is often outdated by the time it's complete. Marketing campaigns suffer from poor targeting.", expectedOutcome: 'Real-time customer segments that update automatically, enabling personalized marketing with 40% better conversion rates.', successMetrics: ['Reduce segmentation time from 2 weeks to real-time', 'Improve campaign conversion rates by 40%', 'Increase customer lifetime value by 25%'], constraints: ['Must integrate with existing CRM (Salesforce)', 'GDPR compliance required for EU customers', 'Budget capped at $50,000 for Phase 1'] }), timeline_label: '3-4 months', budget_label: '$45,000' },
    { id: '2', title: 'Automated Report Generation', description: '', status: 'approved', progress: 85, start_date: '', target_end_date: '', lead_id: '2', estimated_time: 80, actual_time: 60, estimated_cost: 32000, actual_cost: 28000, estimated_impact: 78, actual_impact: 82, priority: 2, priority_score: 87, linked_idea_id: '2', business_context: '{}', timeline_label: '', budget_label: '' },
    { id: '3', title: 'Predictive Maintenance System', description: '', status: 'under_review', progress: 22, start_date: '', target_end_date: '', lead_id: '5', estimated_time: 200, actual_time: 45, estimated_cost: 75000, actual_cost: 18000, estimated_impact: 90, actual_impact: 0, priority: 3, priority_score: 84, linked_idea_id: '3', business_context: '{}', timeline_label: '', budget_label: '' },
    { id: '4', title: 'Real-time Analytics Dashboard', description: '', status: 'approved', progress: 95, start_date: '', target_end_date: '', lead_id: '8', estimated_time: 60, actual_time: 55, estimated_cost: 28000, actual_cost: 26000, estimated_impact: 72, actual_impact: 70, priority: 4, priority_score: 81, linked_idea_id: '4', business_context: '{}', timeline_label: '', budget_label: '' },
    { id: '5', title: 'Smart Inventory Optimization', description: '', status: 'sent_back', progress: 15, start_date: '', target_end_date: '', lead_id: '9', estimated_time: 100, actual_time: 30, estimated_cost: 38000, actual_cost: 12000, estimated_impact: 68, actual_impact: 0, priority: 5, priority_score: 78, linked_idea_id: '5', business_context: '{}', timeline_label: '', budget_label: '' },
    { id: '6', title: 'Employee Training Assistant', description: '', status: 'under_review', progress: 18, start_date: '', target_end_date: '', lead_id: '3', estimated_time: 90, actual_time: 20, estimated_cost: 35000, actual_cost: 8000, estimated_impact: 65, actual_impact: 0, priority: 6, priority_score: 74, linked_idea_id: '6', business_context: '{}', timeline_label: '', budget_label: '' },
  ];

  const edges = [
    { id: '1', idea_id: '1', status: 'complete', confidence: 'high', owner_id: '1', impact_short_term: 'Automated segmentation reduces manual effort by 80%. Initial customer insights available within 2 weeks.', impact_mid_term: 'Expected 15% reduction in churn through targeted campaigns. Marketing ROI improvement of 25%.', impact_long_term: 'Full personalization pipeline enabling real-time customer journey optimization across all channels.', updated_at: '2024-02-28' },
    { id: '2', idea_id: '2', status: 'complete', confidence: 'medium', owner_id: '2', impact_short_term: '', impact_mid_term: '', impact_long_term: '', updated_at: '2024-02-25' },
    { id: '3', idea_id: '3', status: 'draft', confidence: 'low', owner_id: '5', impact_short_term: '', impact_mid_term: '', impact_long_term: '', updated_at: '2024-02-20' },
    { id: '4', idea_id: '4', status: 'complete', confidence: 'high', owner_id: '8', impact_short_term: '', impact_mid_term: '', impact_long_term: '', updated_at: '2024-02-18' },
    { id: '5', idea_id: '5', status: 'missing', confidence: '', owner_id: '', impact_short_term: '', impact_mid_term: '', impact_long_term: '', updated_at: '' },
    { id: '6', idea_id: '7', status: 'complete', confidence: 'high', owner_id: '1', impact_short_term: 'Handle 60% of tier-1 inquiries automatically. Reduce agent workload significantly.', impact_mid_term: '40% reduction in support costs. Improved 24/7 availability for customers.', impact_long_term: 'Full self-service capability for common issues. Agents focus on complex cases only.', updated_at: '2024-02-28' },
  ];

  const activities = [
    { id: '1', type: 'idea_scored', actor_id: '1', action: 'scored', target: 'AI-Powered Customer Support Bot', timestamp: '10 minutes ago', score: 87, status: null, comment: null },
    { id: '2', type: 'task_completed', actor_id: '7', action: 'completed task', target: 'Design system audit', timestamp: '25 minutes ago', score: null, status: null, comment: null },
    { id: '3', type: 'idea_created', actor_id: '5', action: 'submitted new idea', target: 'Mobile App Redesign', timestamp: '1 hour ago', score: null, status: null, comment: null },
    { id: '4', type: 'comment_added', actor_id: '4', action: 'commented on', target: 'Q1 Analytics Dashboard', timestamp: '2 hours ago', score: null, status: null, comment: 'Great progress on the charts!' },
    { id: '5', type: 'user_joined', actor_id: '6', action: 'joined the team', target: 'Product Innovation', timestamp: '3 hours ago', score: null, status: null, comment: null },
    { id: '6', type: 'status_changed', actor_id: '9', action: 'changed status of', target: 'Customer Feedback Portal', timestamp: '4 hours ago', score: null, status: 'In Progress', comment: null },
    { id: '7', type: 'idea_converted', actor_id: '10', action: 'converted idea to project', target: 'Automated Testing Framework', timestamp: '5 hours ago', score: null, status: null, comment: null },
    { id: '8', type: 'project_created', actor_id: '1', action: 'created new project', target: 'Performance Optimization Initiative', timestamp: '6 hours ago', score: null, status: null, comment: null },
    { id: '9', type: 'task_completed', actor_id: '5', action: 'completed task', target: 'API documentation update', timestamp: 'Yesterday', score: null, status: null, comment: null },
    { id: '10', type: 'idea_scored', actor_id: '7', action: 'scored', target: 'Data Pipeline Modernization', timestamp: 'Yesterday', score: 92, status: null, comment: null },
  ];

  const notifications = [
    { id: '1', title: 'New idea submitted', message: 'Marketing team submitted "AI Chatbot Integration"', time: '5 min ago', is_unread: 1 },
    { id: '2', title: 'Project approved', message: 'Your project "Mobile App Redesign" was approved', time: '1 hour ago', is_unread: 1 },
    { id: '3', title: 'Comment on idea', message: 'John commented on "Customer Portal"', time: '2 hours ago', is_unread: 0 },
    { id: '4', title: 'Review requested', message: 'Sarah requested your review on "API Gateway"', time: '1 day ago', is_unread: 0 },
  ];

  const crunchColumns = [
    { id: '1', original_name: 'CUST_ID', friendly_name: '', data_type: 'text', description: '', sample_values: JSON.stringify(['C001', 'C002', 'C003']), is_acronym: 1, acronym_expansion: '' },
    { id: '2', original_name: 'TXN_DT', friendly_name: '', data_type: 'date', description: '', sample_values: JSON.stringify(['2024-01-15', '2024-01-16', '2024-01-17']), is_acronym: 1, acronym_expansion: '' },
    { id: '3', original_name: 'AMT', friendly_name: '', data_type: 'number', description: '', sample_values: JSON.stringify(['150.00', '299.99', '75.50']), is_acronym: 1, acronym_expansion: '' },
    { id: '4', original_name: 'PROD_CAT', friendly_name: '', data_type: 'text', description: '', sample_values: JSON.stringify(['Electronics', 'Apparel', 'Home']), is_acronym: 1, acronym_expansion: '' },
    { id: '5', original_name: 'REP_ID', friendly_name: '', data_type: 'text', description: '', sample_values: JSON.stringify(['R101', 'R102', 'R103']), is_acronym: 1, acronym_expansion: '' },
    { id: '6', original_name: 'STATUS', friendly_name: '', data_type: 'text', description: '', sample_values: JSON.stringify(['COMP', 'PEND', 'CANC']), is_acronym: 0, acronym_expansion: '' },
  ];

  const processSteps = [
    { id: 'ps1', process_id: '1', title: 'Receive signed contract', description: 'Sales team sends signed contract to customer success inbox', owner: 'Sales Team', role: 'Account Executive', tools: JSON.stringify(['Email', 'Document']), duration: 'Immediate', sort_order: 1, type: 'start' },
    { id: 'ps2', process_id: '1', title: 'Create customer record', description: 'Enter customer details in CRM and create project folder', owner: 'Customer Success', role: 'CS Manager', tools: JSON.stringify(['Database', 'Files']), duration: '15 minutes', sort_order: 2, type: 'action' },
    { id: 'ps3', process_id: '1', title: 'Schedule kickoff call', description: 'Reach out to customer to schedule implementation kickoff', owner: 'Customer Success', role: 'Implementation Specialist', tools: JSON.stringify(['Email', 'Phone']), duration: '1 day', sort_order: 3, type: 'action' },
    { id: 'ps4', process_id: '1', title: 'Conduct kickoff meeting', description: 'Review goals, timeline, and assign customer contacts', owner: 'Customer Success', role: 'Implementation Specialist', tools: JSON.stringify(['Chat', 'Document']), duration: '1 hour', sort_order: 4, type: 'action' },
    { id: 'ps5', process_id: '1', title: 'Technical setup complete', description: 'Engineering confirms environment is ready for customer use', owner: 'Engineering', role: 'Solutions Engineer', tools: JSON.stringify(['Database', 'Website']), duration: '2 days', sort_order: 5, type: 'action' },
  ];

  const notificationPreferences = [
    { id: 'idea_submitted', category_id: 'ideas', label: 'New idea submitted', description: 'When someone submits a new idea', is_email_enabled: 1, is_push_enabled: 1 },
    { id: 'idea_scored', category_id: 'ideas', label: 'Idea scored', description: 'When an idea receives an AI score', is_email_enabled: 1, is_push_enabled: 0 },
    { id: 'idea_converted', category_id: 'ideas', label: 'Idea converted to project', description: 'When an idea becomes a project', is_email_enabled: 1, is_push_enabled: 1 },
    { id: 'idea_comment', category_id: 'ideas', label: 'Comment on your idea', description: 'When someone comments on your idea', is_email_enabled: 1, is_push_enabled: 1 },
    { id: 'project_created', category_id: 'projects', label: 'New project created', description: 'When a new project is started', is_email_enabled: 1, is_push_enabled: 0 },
    { id: 'task_assigned', category_id: 'projects', label: 'Task assigned to you', description: 'When you are assigned a new task', is_email_enabled: 1, is_push_enabled: 1 },
    { id: 'task_completed', category_id: 'projects', label: 'Task completed', description: 'When a task in your project is completed', is_email_enabled: 0, is_push_enabled: 0 },
    { id: 'project_status', category_id: 'projects', label: 'Project status changed', description: 'When a project status is updated', is_email_enabled: 1, is_push_enabled: 0 },
    { id: 'team_invite', category_id: 'teams', label: 'Team invitation', description: 'When you are invited to join a team', is_email_enabled: 1, is_push_enabled: 1 },
    { id: 'member_joined', category_id: 'teams', label: 'New team member', description: 'When someone joins your team', is_email_enabled: 1, is_push_enabled: 0 },
    { id: 'member_left', category_id: 'teams', label: 'Team member left', description: 'When someone leaves your team', is_email_enabled: 1, is_push_enabled: 0 },
    { id: 'team_mention', category_id: 'teams', label: 'Team mention', description: 'When your team is mentioned', is_email_enabled: 0, is_push_enabled: 1 },
    { id: 'security_alert', category_id: 'account', label: 'Security alerts', description: 'Important security notifications', is_email_enabled: 1, is_push_enabled: 1 },
    { id: 'billing_reminder', category_id: 'account', label: 'Billing reminders', description: 'Upcoming payment reminders', is_email_enabled: 1, is_push_enabled: 0 },
    { id: 'usage_limit', category_id: 'account', label: 'Usage limit warnings', description: 'When approaching plan limits', is_email_enabled: 1, is_push_enabled: 1 },
    { id: 'weekly_digest', category_id: 'account', label: 'Weekly activity digest', description: 'Summary of weekly activity', is_email_enabled: 1, is_push_enabled: 0 },
  ];

  // Batch 3: Idea scores, projects, edges, activities, notifications, crunch columns, process steps, notification preferences
  await Promise.all([
    adapter.ideaScores.put('1', {
      id: 'score-1',
      overall: 82,
      impact_score: 88,
      impact_breakdown: JSON.stringify([
        { label: 'Business Value', score: 9, maxScore: 10, reason: 'Direct revenue impact through improved conversions' },
        { label: 'Strategic Alignment', score: 8, maxScore: 10, reason: 'Supports digital transformation goals' },
        { label: 'User Benefit', score: 9, maxScore: 10, reason: 'Saves significant time for marketing team' },
      ]),
      feasibility_score: 75,
      feasibility_breakdown: JSON.stringify([
        { label: 'Technical Complexity', score: 7, maxScore: 10, reason: 'Requires ML expertise and data pipeline' },
        { label: 'Resource Availability', score: 8, maxScore: 10, reason: 'Team has relevant skills' },
        { label: 'Integration Effort', score: 8, maxScore: 10, reason: 'Works with existing CRM' },
      ]),
      efficiency_score: 85,
      efficiency_breakdown: JSON.stringify([
        { label: 'Time to Value', score: 9, maxScore: 10, reason: 'MVP deliverable in 6-8 weeks' },
        { label: 'Cost Efficiency', score: 8, maxScore: 10, reason: 'Reasonable investment for expected returns' },
        { label: 'Scalability', score: 9, maxScore: 10, reason: 'Can expand to other use cases' },
      ]),
      estimated_time: '6-8 weeks',
      estimated_cost: '$45,000 - $65,000',
      recommendation: 'Strong candidate for immediate prioritization. High impact with manageable complexity. Recommend starting with a focused pilot on top customer segment.',
    }),
    ...projects.map(project => adapter.projects.put(project.id, project)),
    ...edges.map(edge => adapter.edges.put(edge.id, edge)),
    ...activities.map(activity => adapter.activities.put(activity.id, activity)),
    ...notifications.map(notification => adapter.notifications.put(notification.id, notification)),
    ...crunchColumns.map(column => adapter.crunchColumns.put(column.id, column)),
    ...processSteps.map(step => adapter.processSteps.put(step.id, step)),
    ...notificationPreferences.map(preference => adapter.notificationPreferences.put(preference.id, preference)),
  ]);

  // Batch 4: Project team, milestones, project tasks, discussions, project versions, clarifications, edge outcomes
  const teamMembers = [
    { id: 'pt-1-1', project_id: '1', user_id: '1', role: 'Project Lead', type: 'business' },
    { id: 'pt-1-2', project_id: '1', user_id: '2', role: 'ML Engineer', type: 'engineering' },
    { id: 'pt-1-3', project_id: '1', user_id: '3', role: 'Data Scientist', type: 'engineering' },
    { id: 'pt-1-4', project_id: '1', user_id: '4', role: 'Backend Developer', type: 'engineering' },
  ];

  const milestones = [
    { id: 'm1', project_id: '1', title: 'Data Pipeline Setup', status: 'completed', date: '2024-01-30', sort_order: 1 },
    { id: 'm2', project_id: '1', title: 'Model Training Complete', status: 'completed', date: '2024-02-15', sort_order: 2 },
    { id: 'm3', project_id: '1', title: 'Integration Testing', status: 'in_progress', date: '2024-03-01', sort_order: 3 },
    { id: 'm4', project_id: '1', title: 'User Acceptance Testing', status: 'pending', date: '2024-03-20', sort_order: 4 },
    { id: 'm5', project_id: '1', title: 'Production Deployment', status: 'pending', date: '2024-04-01', sort_order: 5 },
  ];

  const tasks = [
    { id: 'task-1', project_id: '1', name: 'Set up data pipeline', priority: 'High', description: 'Configure ETL pipeline for customer data ingestion', skills: JSON.stringify(['Python', 'Apache Airflow', 'SQL']), hours: 24, assigned_to_id: '2' },
    { id: 'task-2', project_id: '1', name: 'Train ML model', priority: 'High', description: 'Develop and train clustering model using customer behavior data', skills: JSON.stringify(['Machine Learning', 'Python', 'scikit-learn']), hours: 40, assigned_to_id: '' },
    { id: 'task-3', project_id: '1', name: 'Design dashboard UI', priority: 'Medium', description: 'Create visual interface for segment exploration and management', skills: JSON.stringify(['React', 'D3.js', 'CSS']), hours: 32, assigned_to_id: '' },
    { id: 'task-4', project_id: '1', name: 'Build API endpoints', priority: 'Medium', description: 'RESTful API for segment data access and management', skills: JSON.stringify(['Node.js', 'REST API', 'PostgreSQL']), hours: 20, assigned_to_id: '' },
    { id: 'task-5', project_id: '1', name: 'Create documentation', priority: 'Low', description: 'Technical documentation and user guides for the segmentation system', skills: JSON.stringify(['Technical Writing', 'Markdown']), hours: 12, assigned_to_id: '' },
  ];

  const discussions = [
    { id: 'd1', project_id: '1', author_id: '1', date: '2024-02-28', message: 'Great progress on the integration testing. We should be ready for UAT next week.' },
    { id: 'd2', project_id: '1', author_id: '2', date: '2024-02-25', message: 'Segmentation accuracy is now at 94%. Exceeding our initial target of 90%.' },
    { id: 'd3', project_id: '1', author_id: '4', date: '2024-02-20', message: 'API endpoints are ready for frontend integration.' },
  ];

  const versions = [
    { id: 'v1', project_id: '1', version: 'v1.2', date: '2024-02-28', changes: 'Added real-time segmentation capability', author_id: '2' },
    { id: 'v2', project_id: '1', version: 'v1.1', date: '2024-02-15', changes: 'Improved model accuracy by 12%', author_id: '3' },
    { id: 'v3', project_id: '1', version: 'v1.0', date: '2024-01-30', changes: 'Initial model deployment', author_id: '1' },
  ];

  const clarifications = [
    { id: 'c1', project_id: '1', question: 'What data sources are currently available for customer behavior tracking? We need to understand the data pipeline before designing the ML model.', asked_by_id: '2', asked_at: '2024-02-20', status: 'answered', answer: 'We have event tracking via Segment, transaction data in our data warehouse (Snowflake), and email engagement metrics from Mailchimp. All can be accessed via APIs.', answered_by_id: '1', answered_at: '2024-02-21' },
    { id: 'c2', project_id: '1', question: 'Are there any existing segment definitions we should match, or are we free to discover optimal segments through clustering?', asked_by_id: '3', asked_at: '2024-02-22', status: 'answered', answer: "Marketing has 5 legacy segments they use today (High Value, Growth, At-Risk, New, Dormant). We'd like to preserve compatibility but welcome additional discovered segments.", answered_by_id: '1', answered_at: '2024-02-22' },
    { id: 'c3', project_id: '1', question: "What's the expected latency requirement for segment updates? Real-time vs batch processing has significant architecture implications.", asked_by_id: '4', asked_at: '2024-02-25', status: 'pending', answer: null, answered_by_id: null, answered_at: null },
  ];

  await Promise.all([
    ...teamMembers.map(teamMember => adapter.projectTeam.put(teamMember.project_id, teamMember.user_id, teamMember)),
    ...milestones.map(milestone => adapter.milestones.put(milestone.id, milestone)),
    ...tasks.map(task => adapter.projectTasks.put(task.id, task)),
    ...discussions.map(discussion => adapter.discussions.put(discussion.id, discussion)),
    ...versions.map(version => adapter.projectVersions.put(version.id, version)),
    ...clarifications.map(clarification => adapter.clarifications.put(clarification.id, clarification)),
    adapter.edgeOutcomes.put('eo1', { edge_id: '1', description: 'Reduce customer churn rate' }),
    adapter.edgeOutcomes.put('eo2', { edge_id: '1', description: 'Increase marketing ROI' }),
    adapter.edgeOutcomes.put('eo3', { edge_id: '2', description: 'Automate report generation' }),
    adapter.edgeOutcomes.put('eo4', { edge_id: '2', description: 'Reduce manual effort' }),
    adapter.edgeOutcomes.put('eo5', { edge_id: '2', description: 'Improve data quality' }),
    adapter.edgeOutcomes.put('eo6', { edge_id: '3', description: 'Predict equipment failures' }),
    adapter.edgeOutcomes.put('eo7', { edge_id: '4', description: 'Real-time data visibility' }),
    adapter.edgeOutcomes.put('eo8', { edge_id: '4', description: 'Improve decision speed' }),
    adapter.edgeOutcomes.put('eo9', { edge_id: '6', description: 'Reduce support ticket volume' }),
    adapter.edgeOutcomes.put('eo10', { edge_id: '6', description: 'Improve customer satisfaction' }),
  ]);

  // Batch 5: Edge metrics (reference edge outcomes)
  await Promise.all([
    adapter.edgeMetrics.put('em1', { outcome_id: 'eo1', name: 'Churn Rate Reduction', target: '15', unit: '%', current: '12' }),
    adapter.edgeMetrics.put('em2', { outcome_id: 'eo1', name: 'Customer Retention', target: '85', unit: '%', current: '82' }),
    adapter.edgeMetrics.put('em3', { outcome_id: 'eo2', name: 'Campaign Conversion', target: '25', unit: '%', current: '28' }),
    adapter.edgeMetrics.put('em4', { outcome_id: 'eo2', name: 'Cost per Acquisition', target: '45', unit: '$', current: '42' }),
    adapter.edgeMetrics.put('em5', { outcome_id: 'eo3', name: 'Report Time', target: '5', unit: 'min', current: '8' }),
    adapter.edgeMetrics.put('em6', { outcome_id: 'eo3', name: 'Accuracy', target: '99', unit: '%', current: '95' }),
    adapter.edgeMetrics.put('em7', { outcome_id: 'eo4', name: 'Effort Reduction', target: '80', unit: '%', current: '60' }),
    adapter.edgeMetrics.put('em8', { outcome_id: 'eo5', name: 'Data Quality', target: '95', unit: '%', current: '88' }),
    adapter.edgeMetrics.put('em9', { outcome_id: 'eo5', name: 'Error Rate', target: '1', unit: '%', current: '3' }),
    adapter.edgeMetrics.put('em10', { outcome_id: 'eo6', name: 'Detection Rate', target: '90', unit: '%', current: '45' }),
    adapter.edgeMetrics.put('em11', { outcome_id: 'eo6', name: 'False Positive Rate', target: '5', unit: '%', current: '15' }),
    adapter.edgeMetrics.put('em12', { outcome_id: 'eo7', name: 'Dashboard Load', target: '2', unit: 's', current: '3' }),
    adapter.edgeMetrics.put('em13', { outcome_id: 'eo8', name: 'Decision Time', target: '1', unit: 'hr', current: '4' }),
    adapter.edgeMetrics.put('em14', { outcome_id: 'eo8', name: 'Data Freshness', target: '5', unit: 'min', current: '30' }),
    adapter.edgeMetrics.put('em15', { outcome_id: 'eo9', name: 'Ticket Reduction', target: '40', unit: '%', current: '' }),
    adapter.edgeMetrics.put('em16', { outcome_id: 'eo9', name: 'First Response Time', target: '1', unit: 'min', current: '' }),
    adapter.edgeMetrics.put('em17', { outcome_id: 'eo10', name: 'CSAT Score', target: '4.5', unit: '/5', current: '' }),
    adapter.edgeMetrics.put('em18', { outcome_id: 'eo10', name: 'Resolution Rate', target: '85', unit: '%', current: '' }),
  ]);
}
