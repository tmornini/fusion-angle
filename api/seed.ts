import type { DbAdapter } from './db';
import type {
    IdeaEntity,
    IdeaScoreIdeaEntity,
    ProjectEntity,
    EdgeEntity,
    ActivityEntity,
    CrunchColumnEntity,
    CrunchColumnAcronymEntity,
    CrunchColumnAcronymLinkEntity,
    FlowStepEntity,
    ClarificationEntity,
    ClarificationAnswerEntity,
    ClarificationAnswerClarificationEntity,
    IdeaSubmissionEntity,
    IdeaProjectLinkEntity,
    EdgeIdeaEntity,
    EdgeOwnershipEntity,
    EdgeOutcomeEdgeEntity,
    EdgeMetricOutcomeEntity,
    TaskAssignmentEntity,
    DiscussionAuthorshipEntity,
    DiscussionProjectEntity,
    VersionAuthorshipEntity,
    ActivityActorEntity,
    ClarificationAskerEntity,
    ClarificationAnswererEntity,
    ClarificationProjectEntity,
    ProcessStepProcessEntity,
    MilestoneProjectEntity,
    ProjectTaskProjectEntity,
    ProjectVersionProjectEntity,
} from './types';
import {
    jsonArrayField,
    jsonObjectField,
} from './types';

export async function populateMockData(
    adapter: DbAdapter,
): Promise<void> {
    const users = [
        {
            id: '1',
            first_name: 'Sarah',
            last_name: 'Chen',
            email: 'sarah.chen@company.com',
            role: 'Project Lead',
            department: 'Operations',
            status: 'active',
            availability: 85,
            performance_score: 94,
            projects_completed: 12,
            current_projects: 3,
            strengths: [
                'Strategic Planning',
                'Team Leadership',
                'Risk Management',
            ],
            team_dimensions: {
                driver: 78,
                analytical: 85,
                expressive: 62,
                amiable: 70,
            },
            phone: '+1 (555) 201-3847',
            bio: 'Operations leader who'
                + ' thrives on aligning'
                + ' cross-functional teams'
                + ' around strategic goals.',
            last_active:
                '2024-02-28T16:00:00.000000Z',
        },
        {
            id: '2',
            first_name: 'Mike',
            last_name: 'Thompson',
            email: 'mike.thompson@company.com',
            role: 'ML Engineer',
            department: 'Engineering',
            status: 'active',
            availability: 60,
            performance_score: 91,
            projects_completed: 8,
            current_projects: 2,
            strengths: [
                'Machine Learning',
                'Python',
                'Data Architecture',
            ],
            team_dimensions: {
                driver: 55,
                analytical: 95,
                expressive: 40,
                amiable: 58,
            },
            phone: '+1 (555) 318-7642',
            bio: 'ML engineer focused on'
                + ' scalable data pipelines'
                + ' and production-grade'
                + ' model deployment.',
            last_active:
                '2024-02-27'
                + 'T15:30:00.000000Z',
        },
        {
            id: '3',
            first_name: 'Jessica',
            last_name: 'Park',
            email: 'jessica.park@company.com',
            role: 'Data Scientist',
            department: 'Analytics',
            status: 'active',
            availability: 70,
            performance_score: 88,
            projects_completed: 6,
            current_projects: 2,
            strengths: [
                'Statistical Analysis',
                'Visualization',
                'Predictive Modeling',
            ],
            team_dimensions: {
                driver: 45,
                analytical: 92,
                expressive: 68,
                amiable: 75,
            },
            phone: '+1 (555) 429-0153',
            bio: 'Data scientist passionate'
                + ' about turning complex'
                + ' datasets into actionable'
                + ' business insights.',
            last_active:
                '2024-02-28T17:00:00.000000Z',
        },
        {
            id: '4',
            first_name: 'David',
            last_name: 'Martinez',
            email: 'david.martinez@company.com',
            role: 'Backend Developer',
            department: 'Engineering',
            status: 'active',
            availability: 40,
            performance_score: 86,
            projects_completed: 10,
            current_projects: 4,
            strengths: [
                'API Development',
                'Database Design',
                'System Integration',
            ],
            team_dimensions: {
                driver: 70,
                analytical: 82,
                expressive: 35,
                amiable: 55,
            },
            phone: '+1 (555) 537-8216',
            bio: 'Backend developer who'
                + ' builds reliable APIs'
                + ' and loves optimizing'
                + ' database performance.',
            last_active:
                '2024-02-28T14:00:00.000000Z',
        },
        {
            id: '5',
            first_name: 'Emily',
            last_name: 'Rodriguez',
            email: 'emily.rodriguez@company.com',
            role: 'UX Designer',
            department: 'Design',
            status: 'pending',
            availability: 90,
            performance_score: 92,
            projects_completed: 15,
            current_projects: 1,
            strengths: [
                'User Research',
                'Prototyping',
                'Design Systems',
            ],
            team_dimensions: {
                driver: 50,
                analytical: 72,
                expressive: 88,
                amiable: 85,
            },
            phone: '+1 (555) 642-9374',
            bio: 'UX designer dedicated to'
                + ' crafting intuitive'
                + ' experiences grounded in'
                + ' user research.',
            last_active:
                '2024-02-28'
                + 'T09:15:00.000000Z',
        },
        {
            id: '6',
            first_name: 'Alex',
            last_name: 'Kim',
            email: 'alex.kim@company.com',
            role: 'Product Manager',
            department: 'Product',
            status: 'active',
            availability: 55,
            performance_score: 89,
            projects_completed: 7,
            current_projects: 3,
            strengths: [
                'Roadmap Planning',
                'Stakeholder Management',
                'Agile Methods',
            ],
            team_dimensions: {
                driver: 85,
                analytical: 70,
                expressive: 78,
                amiable: 65,
            },
            phone: '+1 (555) 753-1048',
            bio: 'Product manager skilled at'
                + ' translating customer'
                + ' needs into clear'
                + ' roadmaps.',
            last_active:
                '2024-02-28'
                + 'T11:45:00.000000Z',
        },
        {
            id: '7',
            first_name: 'Marcus',
            last_name: 'Johnson',
            email: 'marcus@acmecorp.com',
            role: 'manager',
            department: 'Product',
            status: 'active',
            availability: 80,
            performance_score: 85,
            projects_completed: 5,
            current_projects: 2,
            strengths: [
                'Product Strategy',
                'Team Management',
            ],
            team_dimensions: {
                driver: 75,
                analytical: 65,
                expressive: 80,
                amiable: 70,
            },
            phone: '+1 (555) 864-2390',
            bio: 'Product strategy manager'
                + ' with a knack for'
                + ' spotting market gaps'
                + ' and coaching teams.',
            last_active:
                '2024-02-28T17:30:00.000000Z',
        },
        {
            id: '8',
            first_name: 'David',
            last_name: 'Kim',
            email: 'david.kim@company.com',
            role: 'member',
            department: 'Engineering',
            status: 'active',
            availability: 75,
            performance_score: 83,
            projects_completed: 4,
            current_projects: 2,
            strengths: [
                'Frontend Development',
                'React',
                'TypeScript',
            ],
            team_dimensions: {
                driver: 60,
                analytical: 78,
                expressive: 55,
                amiable: 65,
            },
            phone: '+1 (555) 975-4831',
            bio: 'Frontend developer who'
                + ' cares deeply about'
                + ' performance and'
                + ' accessible UI patterns.',
            last_active:
                '2024-02-26'
                + 'T14:00:00.000000Z',
        },
        {
            id: '9',
            first_name: 'Lisa',
            last_name: 'Wang',
            email: 'lisa@acmecorp.com',
            role: 'viewer',
            department: 'Sales',
            status: 'active',
            availability: 70,
            performance_score: 80,
            projects_completed: 3,
            current_projects: 1,
            strengths: [
                'Sales Strategy',
                'Client Relations',
            ],
            team_dimensions: {
                driver: 80,
                analytical: 55,
                expressive: 85,
                amiable: 75,
            },
            phone: '+1 (555) 086-5712',
            bio: 'Sales strategist who'
                + ' builds lasting client'
                + ' relationships through'
                + ' consultative selling.',
            last_active:
                '2024-02-27T18:00:00.000000Z',
        },
        {
            id: '10',
            first_name: 'James',
            last_name: 'Miller',
            email: 'james@acmecorp.com',
            role: 'member',
            department: 'Engineering',
            status: 'deactivated',
            availability: 0,
            performance_score: 78,
            projects_completed: 6,
            current_projects: 0,
            strengths: [
                'Backend Development',
                'Python',
            ],
            team_dimensions: {
                driver: 55,
                analytical: 82,
                expressive: 40,
                amiable: 50,
            },
            phone: '+1 (555) 197-3064',
            bio: 'Backend engineer with'
                + ' strong Python skills'
                + ' and a focus on clean'
                + ' architecture.',
            last_active:
                '2024-02-21T18:00:00.000000Z',
        },
        {
            id: 'current',
            first_name: 'Tony',
            last_name: 'Stark',
            email: 'demo@example.com',
            role: 'Admin',
            department: 'Product',
            status: 'active',
            availability: 100,
            performance_score: 95,
            projects_completed: 20,
            current_projects: 5,
            strengths: [
                'Strategic Planning',
                'Data Analysis',
                'Stakeholder Management',
            ],
            team_dimensions: {
                driver: 80,
                analytical: 80,
                expressive: 80,
                amiable: 80,
            },
            phone: '+1 (555) 123-4567',
            bio: 'Passionate about building'
                + ' products that solve'
                + ' real problems.',
            last_active:
                '2024-02-28'
                + 'T18:00:00.000000Z',
        },
    ];

    await Promise.all(users.map(user =>
        adapter.users.put(user.id, {
            ...user,
            strengths:
                jsonArrayField(user.strengths),
            team_dimensions:
                jsonObjectField(
                    user.team_dimensions,
                ),
        }),
    ));

    const ideas: IdeaEntity[] = [
        {
            id: '1',
            title: 'AI-Powered Customer'
                + ' Segmentation',
            score: 92,
            estimated_impact: 85,
            estimated_duration: 432000,
            estimated_cost: 45000,
            priority: 1,
            status: 'in-review',

            problem_statement:
                'Marketing team spends 20+'
                + ' hours weekly manually'
                + ' segmenting customers,'
                + ' leading to delayed'
                + ' campaigns and missed'
                + ' opportunities.',
            proposed_solution:
                'Implement machine learning'
                + ' model to automatically'
                + ' segment customers based'
                + ' on behavior patterns.',
            expected_outcome:
                'Reduce segmentation time'
                + ' by 80% and increase'
                + ' conversion rates'
                + ' by 25%.',
            category: 'Marketing',
            readiness: 'ready',

            impact_label: 'High',
            effort_label: 'Medium',
            description:
                'Helps marketing teams'
                + ' target the right'
                + ' audiences automatically'
                + ' using behavioral data.',

            risks: jsonArrayField([]),
            assumptions: jsonArrayField([]),
            alignments: jsonArrayField([]),
            effort_duration_estimate:
                '4-5 weeks',
            effort_team_size:
                '2-3 engineers',
            cost_estimate:
                '$40,000 - $50,000',
            cost_breakdown:
                'ML development: $30K,'
                + ' data prep: $10K,'
                + ' testing: $5K',
            success_metrics:
                'Segmentation time reduced'
                + ' from 20+ hours to under'
                + ' 4 hours weekly; campaign'
                + ' conversion rate improves'
                + ' by 25%',
        },
        {
            id: '2',
            title: 'Automated Report'
                + ' Generation',
            score: 87,
            estimated_impact: 78,
            estimated_duration: 288000,
            estimated_cost: 32000,
            priority: 2,
            status: 'approved',

            problem_statement:
                'Analysts spend 15+ hours'
                + ' per week manually'
                + ' compiling reports from'
                + ' multiple data sources,'
                + ' causing delays in'
                + ' decision-making.',
            proposed_solution:
                'Build an automated'
                + ' pipeline that aggregates'
                + ' data sources and'
                + ' generates formatted'
                + ' reports on a schedule.',
            expected_outcome:
                'Eliminate manual report'
                + ' assembly, freeing 15'
                + ' analyst-hours weekly and'
                + ' reducing report delivery'
                + ' time from days to'
                + ' minutes.',
            category: 'Engineering',
            readiness: 'ready',

            impact_label: 'High',
            effort_label: 'Low',
            description:
                'Enables analysts and'
                + ' managers to receive'
                + ' up-to-date reports'
                + ' without manual effort.',

            risks: jsonArrayField([]),
            assumptions: jsonArrayField([]),
            alignments: jsonArrayField([]),
            effort_duration_estimate:
                '3-4 weeks',
            effort_team_size:
                '2 engineers',
            cost_estimate:
                '$25,000 - $35,000',
            cost_breakdown:
                'Pipeline dev: $20K,'
                + ' template design: $5K,'
                + ' QA: $5K',
            success_metrics:
                '15 analyst-hours freed'
                + ' per week; report'
                + ' delivery time under 5'
                + ' minutes; zero manual'
                + ' data compilation',
        },
        {
            id: '3',
            title: 'Predictive Maintenance'
                + ' System',
            score: 84,
            estimated_impact: 90,
            estimated_duration: 720000,
            estimated_cost: 75000,
            priority: 3,
            status: 'active',

            problem_statement:
                'Unplanned equipment'
                + ' downtime costs $50K per'
                + ' incident and occurs 3-4'
                + ' times per quarter due to'
                + ' reactive maintenance.',
            proposed_solution:
                'Deploy IoT sensors with'
                + ' ML models to predict'
                + ' equipment failures 2-4'
                + ' weeks before they occur.',
            expected_outcome:
                'Reduce unplanned downtime'
                + ' by 70% and extend'
                + ' equipment lifespan by'
                + ' 20%, saving $150K'
                + ' annually.',
            category: 'Operations',
            readiness: 'needs-info',

            impact_label: 'High',
            effort_label: 'High',
            description:
                'Serves operations and'
                + ' facilities teams who'
                + ' manage critical'
                + ' equipment uptime.',

            risks: jsonArrayField([]),
            assumptions: jsonArrayField([]),
            alignments: jsonArrayField([]),
            effort_duration_estimate:
                '8-10 weeks',
            effort_team_size:
                '3-4 engineers',
            cost_estimate:
                '$65,000 - $80,000',
            cost_breakdown:
                'IoT sensors: $25K,'
                + ' ML models: $30K,'
                + ' integration: $15K',
            success_metrics:
                'Unplanned downtime'
                + ' reduced by 70%;'
                + ' equipment lifespan'
                + ' extended 20%; $150K'
                + ' annual savings',
        },
        {
            id: '4',
            title: 'Real-time Analytics'
                + ' Dashboard',
            score: 81,
            estimated_impact: 72,
            estimated_duration: 216000,
            estimated_cost: 28000,
            priority: 4,
            status: 'in-review',

            problem_statement:
                'Leadership relies on'
                + ' weekly batch reports'
                + ' that are outdated by the'
                + ' time they arrive,'
                + ' missing real-time'
                + ' trends.',
            proposed_solution:
                'Create a live dashboard'
                + ' with streaming data'
                + ' pipelines, interactive'
                + ' filters, and automated'
                + ' anomaly alerts.',
            expected_outcome:
                'Enable real-time'
                + ' decision-making,'
                + ' reducing response time'
                + ' to market changes from'
                + ' 5 days to under 1 hour.',
            category: 'Product',
            readiness: 'ready',

            impact_label: 'Medium',
            effort_label: 'Low',
            description:
                'Gives leadership and'
                + ' analysts real-time'
                + ' visibility into key'
                + ' business metrics.',

            risks: jsonArrayField([]),
            assumptions: jsonArrayField([]),
            alignments: jsonArrayField([]),
            effort_duration_estimate:
                '2-3 weeks',
            effort_team_size:
                '2 engineers',
            cost_estimate:
                '$22,000 - $30,000',
            cost_breakdown:
                'Frontend: $15K,'
                + ' streaming infra: $8K,'
                + ' alerts: $5K',
            success_metrics:
                'Market response time'
                + ' under 1 hour; dashboard'
                + ' adoption by 90% of'
                + ' leadership; anomaly'
                + ' detection within 5'
                + ' minutes',
        },
        {
            id: '5',
            title: 'Smart Inventory'
                + ' Optimization',
            score: 78,
            estimated_impact: 68,
            estimated_duration: 360000,
            estimated_cost: 38000,
            priority: 5,
            status: 'active',

            problem_statement:
                'Excess inventory ties up'
                + ' $2M in capital while'
                + ' stockouts cause 8% of'
                + ' orders to be delayed or'
                + ' cancelled.',
            proposed_solution:
                'Implement demand'
                + ' forecasting with'
                + ' automatic reorder'
                + ' triggers based on'
                + ' seasonality, trends, and'
                + ' lead times.',
            expected_outcome:
                'Reduce carrying costs by'
                + ' 30% and stockout'
                + ' incidents by 60%,'
                + ' improving customer'
                + ' satisfaction scores.',
            category: 'Operations',
            readiness: 'needs-info',

            impact_label: 'Medium',
            effort_label: 'Medium',
            description:
                'Helps supply chain and'
                + ' warehouse teams balance'
                + ' stock levels with'
                + ' demand forecasts.',

            risks: jsonArrayField([]),
            assumptions: jsonArrayField([]),
            alignments: jsonArrayField([]),
            effort_duration_estimate:
                '4-5 weeks',
            effort_team_size:
                '2-3 engineers',
            cost_estimate:
                '$30,000 - $42,000',
            cost_breakdown:
                'Forecasting model: $20K,'
                + ' ERP integration: $12K,'
                + ' testing: $6K',
            success_metrics:
                'Carrying costs reduced'
                + ' 30%; stockout incidents'
                + ' down 60%; customer'
                + ' satisfaction score'
                + ' improves by 10 points',
        },
        {
            id: '6',
            title: 'Employee Training'
                + ' Assistant',
            score: 74,
            estimated_impact: 65,
            estimated_duration: 324000,
            estimated_cost: 35000,
            priority: 6,
            status: 'archived',

            problem_statement:
                'New hire onboarding takes'
                + ' 6 weeks on average, with'
                + ' inconsistent training'
                + ' quality across'
                + ' departments.',
            proposed_solution:
                'Build an AI training'
                + ' assistant that delivers'
                + ' personalized learning'
                + ' paths and answers'
                + ' procedural questions.',
            expected_outcome:
                'Reduce onboarding time to'
                + ' 3 weeks and improve new'
                + ' hire productivity scores'
                + ' by 40% in the first'
                + ' quarter.',
            category: 'Support',
            readiness: 'incomplete',

            impact_label: 'Medium',
            effort_label: 'Medium',
            description:
                'Supports HR and team'
                + ' leads in delivering'
                + ' consistent, adaptive'
                + ' onboarding content.',

            risks: jsonArrayField([]),
            assumptions: jsonArrayField([]),
            alignments: jsonArrayField([]),
            effort_duration_estimate:
                '3-4 weeks',
            effort_team_size:
                '2-3 engineers',
            cost_estimate:
                '$30,000 - $40,000',
            cost_breakdown:
                'AI model: $18K,'
                + ' content platform: $12K,'
                + ' rollout: $5K',
            success_metrics:
                'Onboarding time reduced'
                + ' to 3 weeks; new hire'
                + ' productivity scores up'
                + ' 40% in first quarter',
        },
        {
            id: '7',
            title: 'AI-Powered Customer'
                + ' Support Chatbot',
            score: 87,
            estimated_impact: 0,
            estimated_duration: 0,
            estimated_cost: 0,
            priority: 8,
            status: 'in-review',

            problem_statement:
                'Support team handles'
                + ' 500+ tier-1 tickets'
                + ' daily, with average'
                + ' response time of 4'
                + ' hours.',
            proposed_solution:
                'Deploy an AI chatbot'
                + ' trained on historical'
                + ' tickets to resolve'
                + ' common inquiries'
                + ' instantly.',
            expected_outcome:
                'Deflect 60% of tier-1'
                + ' tickets and cut'
                + ' average response time'
                + ' to under 30 seconds.',
            category: 'Customer Experience',
            readiness: 'ready',

            impact_label: 'High',
            effort_label: 'Medium',
            description:
                'Implement an intelligent'
                + ' chatbot using GPT-4 to'
                + ' handle tier-1 customer'
                + ' support inquiries. The'
                + ' system would integrate'
                + ' with our existing'
                + ' helpdesk platform and'
                + ' learn from historical'
                + ' ticket data to provide'
                + ' accurate, context-aware'
                + ' responses.',
            risks: jsonArrayField([
                {
                    title:
                        'AI response accuracy',
                    severity: 'high',
                    mitigation:
                        'Implement human'
                        + ' escalation for'
                        + ' low-confidence'
                        + ' responses and'
                        + ' continuous training'
                        + ' loop',
                },
                {
                    title:
                        'Integration complexity',
                    severity: 'medium',
                    mitigation:
                        'Phase rollout'
                        + ' starting with'
                        + ' FAQ-only queries'
                        + ' before expanding'
                        + ' scope',
                },
                {
                    title:
                        'Customer acceptance',
                    severity: 'low',
                    mitigation:
                        'Clear bot'
                        + ' identification and'
                        + ' easy handoff to'
                        + ' human agents',
                },
            ]),
            assumptions: jsonArrayField([
                'Current helpdesk API'
                    + ' supports required'
                    + ' integrations',
                'Historical ticket data is'
                    + ' clean and'
                    + ' categorizable',
                'Legal has approved AI'
                    + ' usage for customer'
                    + ' interactions',
            ]),
            alignments: jsonArrayField([
                'Q1 OKR: Improve customer'
                    + ' satisfaction score'
                    + ' by 15%',
                'Digital transformation'
                    + ' initiative',
                'Cost optimization'
                    + ' program',
            ]),
            effort_duration_estimate:
                '3-4 months',
            effort_team_size:
                '4-5 engineers',
            cost_estimate:
                '$120,000 - $150,000',
            cost_breakdown:
                'Development: $80K,'
                + ' API costs: $20K/year,'
                + ' Training: $10K',
            success_metrics:
                'Tier-1 ticket deflection'
                + ' rate of 60%; average'
                + ' response time under 30'
                + ' seconds; CSAT score'
                + ' above 4.2',
        },
        {
            id: '8',
            title: 'Mobile App Push'
                + ' Notification Revamp',
            score: 72,
            estimated_impact: 0,
            estimated_duration: 0,
            estimated_cost: 0,
            priority: 10,
            status: 'in-review',

            problem_statement:
                'Push notification opt-out'
                + ' rate is 42% due to'
                + ' irrelevant, poorly'
                + ' timed messages.',
            proposed_solution:
                'Implement user-preference'
                + ' controls and ML-based'
                + ' send-time optimization.',
            expected_outcome:
                'Reduce opt-out rate to'
                + ' under 20% and increase'
                + ' notification engagement'
                + ' by 35%.',
            category: 'Product',
            readiness: 'needs-info',

            impact_label: 'Medium',
            effort_label: 'Low',
            description:
                'Improves the mobile'
                + ' experience for end'
                + ' users through smarter'
                + ' notification delivery.',

            risks: jsonArrayField([]),
            assumptions: jsonArrayField([]),
            alignments: jsonArrayField([]),
            effort_duration_estimate:
                '2-3 weeks',
            effort_team_size:
                '1-2 engineers',
            cost_estimate:
                '$12,000 - $18,000',
            cost_breakdown:
                'Mobile dev: $10K,'
                + ' ML tuning: $5K,'
                + ' QA: $3K',
            success_metrics:
                'Opt-out rate below 20%;'
                + ' notification tap rate'
                + ' up 35%; daily active'
                + ' users increase 10%',
        },
        {
            id: '9',
            title: 'Sustainability Dashboard'
                + ' for Operations',
            score: 81,
            estimated_impact: 0,
            estimated_duration: 0,
            estimated_cost: 0,
            priority: 9,
            status: 'in-review',

            problem_statement:
                'No centralized view of'
                + ' energy, water, and'
                + ' waste metrics across'
                + ' facilities.',
            proposed_solution:
                'Build a dashboard that'
                + ' aggregates utility data'
                + ' and tracks ESG goals'
                + ' in real time.',
            expected_outcome:
                'Achieve 15% reduction in'
                + ' energy costs and meet'
                + ' annual ESG reporting'
                + ' requirements.',
            category: 'Operations',
            readiness: 'ready',

            impact_label: 'High',
            effort_label: 'High',
            description:
                'Provides operations and'
                + ' sustainability officers'
                + ' with real-time ESG'
                + ' tracking across sites.',

            risks: jsonArrayField([]),
            assumptions: jsonArrayField([]),
            alignments: jsonArrayField([]),
            effort_duration_estimate:
                '6-8 weeks',
            effort_team_size:
                '3-4 engineers',
            cost_estimate:
                '$55,000 - $70,000',
            cost_breakdown:
                'Data integration: $25K,'
                + ' dashboard UI: $20K,'
                + ' IoT feeds: $15K',
            success_metrics:
                'Energy costs reduced'
                + ' 15%; ESG reports'
                + ' generated in under'
                + ' 1 hour; 100% facility'
                + ' coverage',
        },
        {
            id: '10',
            title: 'Employee Wellness'
                + ' Program Integration',
            score: 45,
            estimated_impact: 0,
            estimated_duration: 0,
            estimated_cost: 0,
            priority: 11,
            status: 'in-review',

            problem_statement:
                'Employee burnout rates'
                + ' are rising with no'
                + ' unified wellness'
                + ' tracking or resources.',
            proposed_solution:
                'Integrate wellness'
                + ' vendors into a single'
                + ' portal with usage'
                + ' analytics for HR.',
            expected_outcome:
                'Increase wellness'
                + ' program participation'
                + ' by 50% and reduce'
                + ' voluntary turnover'
                + ' by 12%.',
            category: 'HR',
            readiness: 'incomplete',

            impact_label: 'Medium',
            effort_label: 'Medium',
            description:
                'Helps HR and employees'
                + ' access wellness'
                + ' resources through a'
                + ' consolidated portal.',

            risks: jsonArrayField([]),
            assumptions: jsonArrayField([]),
            alignments: jsonArrayField([]),
            effort_duration_estimate:
                '4-6 weeks',
            effort_team_size:
                '2-3 engineers',
            cost_estimate:
                '$28,000 - $38,000',
            cost_breakdown:
                'Portal dev: $18K,'
                + ' vendor APIs: $10K,'
                + ' rollout: $5K',
            success_metrics:
                'Wellness participation'
                + ' up 50%; voluntary'
                + ' turnover reduced 12%;'
                + ' employee satisfaction'
                + ' score improves 8%',
        },
        {
            id: '11',
            title: 'Real-time Inventory'
                + ' Tracking System',
            score: 91,
            estimated_impact: 0,
            estimated_duration: 0,
            estimated_cost: 0,
            priority: 7,
            status: 'in-review',

            problem_statement:
                'Inventory counts rely on'
                + ' manual audits that lag'
                + ' 48 hours behind actual'
                + ' stock movements.',
            proposed_solution:
                'Deploy barcode and RFID'
                + ' scanning with live'
                + ' sync to the warehouse'
                + ' management system.',
            expected_outcome:
                'Achieve 99.5% inventory'
                + ' accuracy and eliminate'
                + ' end-of-day manual'
                + ' reconciliation.',
            category: 'Operations',
            readiness: 'ready',

            impact_label: 'High',
            effort_label: 'Medium',
            description:
                'Enables warehouse and'
                + ' logistics staff to'
                + ' track stock movements'
                + ' in real time.',

            risks: jsonArrayField([]),
            assumptions: jsonArrayField([]),
            alignments: jsonArrayField([]),
            effort_duration_estimate:
                '5-6 weeks',
            effort_team_size:
                '3 engineers',
            cost_estimate:
                '$45,000 - $60,000',
            cost_breakdown:
                'Hardware: $20K,'
                + ' software dev: $25K,'
                + ' deployment: $10K',
            success_metrics:
                'Inventory accuracy'
                + ' at 99.5%; manual'
                + ' reconciliation'
                + ' eliminated; stock'
                + ' discrepancies down 90%',
        },
    ];

    await Promise.all([
        ...ideas.map(idea =>
            adapter.ideas.put(idea.id, idea),
        ),
        adapter.flows.put('1', {
            name: 'Customer Onboarding',
            description:
                'End-to-end process for'
                + ' onboarding new enterprise'
                + ' customers',
            department: 'Customer Success',
        }),
        adapter.flows.put('2', {
            name:
                'Sales Pipeline'
                + ' Qualification',
            description:
                'Qualify and advance leads'
                + ' through the sales'
                + ' pipeline from initial'
                + ' contact to closed deal',
            department: 'Sales',
        }),
        adapter.flows.put('3', {
            name:
                'Bug Triage & Resolution',
            description:
                'Classify, prioritize, and'
                + ' resolve reported bugs'
                + ' through structured'
                + ' engineering workflow',
            department: 'Engineering',
        }),
        adapter.flows.put('4', {
            name: 'Quarterly Planning',
            description:
                'Cross-functional planning'
                + ' cycle to set OKRs,'
                + ' allocate resources, and'
                + ' align team priorities',
            department: 'Operations',
        }),
        adapter.companySettings.put({
            name: 'Stark Industries',
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
            next_billing:
                '2025-01-15T00:00:00.000000Z',
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
            last_activity:
                '2024-02-28T16:00:00.000000Z',
            active_users: 14,
        }),
    ]);

    const projects: ProjectEntity[] = [
        {
            id: '1',
            title: 'AI-Powered Customer'
                + ' Segmentation',
            description:
                'Implement machine learning'
                + ' model to automatically'
                + ' segment customers based'
                + ' on behavior, purchase'
                + ' history, and engagement'
                + ' patterns.',
            status: 'approved',
            progress: 72,
            start_date:
                '2024-01-15T00:00:00.000000Z',
            target_end_date:
                '2024-04-15T00:00:00.000000Z',
            estimated_duration: 432000,
            actual_duration: 306000,
            estimated_cost: 45000,
            actual_cost: 38000,
            estimated_impact: 85,
            actual_impact: 78,
            priority: 1,
            priority_score: 92,
            business_context: jsonObjectField({
                problem:
                    'Current manual'
                    + ' segmentation takes 2'
                    + ' weeks and is often'
                    + ' outdated by the time'
                    + " it's complete."
                    + ' Marketing campaigns'
                    + ' suffer from poor'
                    + ' targeting.',
                expectedOutcome:
                    'Real-time customer'
                    + ' segments that update'
                    + ' automatically,'
                    + ' enabling personalized'
                    + ' marketing with 40%'
                    + ' better conversion'
                    + ' rates.',
                successMetrics: [
                    'Reduce segmentation'
                        + ' time from 2 weeks'
                        + ' to real-time',
                    'Improve campaign'
                        + ' conversion rates'
                        + ' by 40%',
                    'Increase customer'
                        + ' lifetime value'
                        + ' by 25%',
                ],
                constraints: [
                    'Must integrate with'
                        + ' existing CRM'
                        + ' (Salesforce)',
                    'GDPR compliance'
                        + ' required for EU'
                        + ' customers',
                    'Budget capped at'
                        + ' $50,000 for'
                        + ' Phase 1',
                ],
            }),
            timeline_label: '3-4 months',
            budget_label: '$45,000',
        },
        {
            id: '2',
            title: 'Automated Report'
                + ' Generation',
            description:
                'Build an automated'
                + ' pipeline that aggregates'
                + ' multiple data sources'
                + ' and generates formatted'
                + ' reports on a schedule.',
            status: 'approved',
            progress: 85,
            start_date:
                '2024-01-08'
                + 'T09:00:00.000000Z',
            target_end_date:
                '2024-02-10'
                + 'T09:00:00.000000Z',
            estimated_duration: 288000,
            actual_duration: 216000,
            estimated_cost: 32000,
            actual_cost: 28000,
            estimated_impact: 78,
            actual_impact: 82,
            priority: 2,
            priority_score: 87,
            business_context: jsonObjectField({}),
            timeline_label: 'On Track',
            budget_label: 'Under Budget',
        },
        {
            id: '3',
            title: 'Predictive Maintenance'
                + ' System',
            description:
                'Deploy IoT sensors with'
                + ' ML models to predict'
                + ' equipment failures'
                + ' before they occur,'
                + ' reducing unplanned'
                + ' downtime.',
            status: 'under-review',
            progress: 22,
            start_date:
                '2024-02-01'
                + 'T09:00:00.000000Z',
            target_end_date:
                '2024-04-15'
                + 'T09:00:00.000000Z',
            estimated_duration: 720000,
            actual_duration: 162000,
            estimated_cost: 75000,
            actual_cost: 18000,
            estimated_impact: 90,
            actual_impact: 0,
            priority: 3,
            priority_score: 84,
            business_context: jsonObjectField({}),
            timeline_label: 'At Risk',
            budget_label: 'Under Budget',
        },
        {
            id: '4',
            title: 'Real-time Analytics'
                + ' Dashboard',
            description:
                'Create a live dashboard'
                + ' with streaming data'
                + ' pipelines and automated'
                + ' anomaly alerts for'
                + ' leadership.',
            status: 'approved',
            progress: 95,
            start_date:
                '2024-01-15'
                + 'T09:00:00.000000Z',
            target_end_date:
                '2024-02-12'
                + 'T09:00:00.000000Z',
            estimated_duration: 216000,
            actual_duration: 198000,
            estimated_cost: 28000,
            actual_cost: 26000,
            estimated_impact: 72,
            actual_impact: 70,
            priority: 4,
            priority_score: 81,
            business_context: jsonObjectField({}),
            timeline_label: 'On Track',
            budget_label: 'On Budget',
        },
        {
            id: '5',
            title: 'Smart Inventory'
                + ' Optimization',
            description:
                'Implement demand'
                + ' forecasting with'
                + ' automatic reorder'
                + ' triggers to reduce'
                + ' carrying costs and'
                + ' stockout incidents.',
            status: 'sent-back',
            progress: 15,
            start_date:
                '2024-02-05'
                + 'T09:00:00.000000Z',
            target_end_date:
                '2024-03-20'
                + 'T09:00:00.000000Z',
            estimated_duration: 360000,
            actual_duration: 108000,
            estimated_cost: 38000,
            actual_cost: 12000,
            estimated_impact: 68,
            actual_impact: 0,
            priority: 5,
            priority_score: 78,
            business_context: jsonObjectField({}),
            timeline_label: 'Behind Schedule',
            budget_label: 'Under Budget',
        },
        {
            id: '6',
            title: 'Employee Training'
                + ' Assistant',
            description:
                'Build an AI training'
                + ' assistant that delivers'
                + ' personalized learning'
                + ' paths and answers'
                + ' procedural questions'
                + ' for new hires.',
            status: 'under-review',
            progress: 18,
            start_date:
                '2024-02-12'
                + 'T09:00:00.000000Z',
            target_end_date:
                '2024-03-25'
                + 'T09:00:00.000000Z',
            estimated_duration: 324000,
            actual_duration: 72000,
            estimated_cost: 35000,
            actual_cost: 8000,
            estimated_impact: 65,
            actual_impact: 0,
            priority: 6,
            priority_score: 74,
            business_context: jsonObjectField({}),
            timeline_label: 'On Track',
            budget_label: 'Under Budget',
        },
    ];

    const edges: EdgeEntity[] = [
        {
            id: '1',
            status: 'complete',
            confidence: 'high',
            impact_short_term:
                'Automated segmentation'
                + ' reduces manual effort'
                + ' by 80%. Initial customer'
                + ' insights available'
                + ' within 2 weeks.',
            impact_mid_term:
                'Expected 15% reduction in'
                + ' churn through targeted'
                + ' campaigns. Marketing ROI'
                + ' improvement of 25%.',
            impact_long_term:
                'Full personalization'
                + ' pipeline enabling'
                + ' real-time customer'
                + ' journey optimization'
                + ' across all channels.',
            updated_at:
                '2024-02-28T14:30:00.000000Z',
        },
        {
            id: '2',
            status: 'complete',
            confidence: 'medium',
            impact_short_term:
                'Eliminate 15 hours of'
                + ' manual report assembly'
                + ' per week. Reports'
                + ' available on demand.',
            impact_mid_term:
                'Analysts redirect freed'
                + ' capacity to strategic'
                + ' analysis. Data-driven'
                + ' decisions accelerate.',
            impact_long_term:
                'Self-service reporting'
                + ' culture across all'
                + ' departments with zero'
                + ' manual compilation.',
            updated_at:
                '2024-02-25T10:00:00.000000Z',
        },
        {
            id: '3',
            status: 'draft',
            confidence: 'low',
            impact_short_term:
                'Initial sensor deployment'
                + ' on critical equipment.'
                + ' Baseline failure data'
                + ' collection begins.',
            impact_mid_term:
                'Predictive models reduce'
                + ' unplanned downtime by'
                + ' 70%. Maintenance costs'
                + ' drop significantly.',
            impact_long_term:
                'Fully autonomous'
                + ' maintenance scheduling'
                + ' extends equipment'
                + ' lifespan by 20%.',
            updated_at:
                '2024-02-20T09:00:00.000000Z',
        },
        {
            id: '4',
            status: 'complete',
            confidence: 'high',
            impact_short_term:
                'Leadership gains'
                + ' real-time visibility'
                + ' into key metrics.'
                + ' Anomaly alerts trigger'
                + ' within minutes.',
            impact_mid_term:
                'Response time to market'
                + ' changes drops from 5'
                + ' days to under 1 hour.',
            impact_long_term:
                'Data-driven culture with'
                + ' 90% leadership adoption.'
                + ' Proactive trend'
                + ' identification.',
            updated_at:
                '2024-02-18T11:00:00.000000Z',
        },
        {
            id: '5',
            status: 'missing',
            confidence: 'medium',
            impact_short_term:
                'Demand forecasting model'
                + ' reduces stockout'
                + ' incidents by 30% in'
                + ' the first quarter.',
            impact_mid_term:
                'Carrying costs reduced'
                + ' by 30% through'
                + ' optimized reorder'
                + ' triggers and inventory'
                + ' levels.',
            impact_long_term:
                'Fully automated supply'
                + ' chain optimization'
                + ' with 60% fewer'
                + ' stockouts and improved'
                + ' satisfaction.',
            updated_at:
                '2024-02-15'
                + 'T09:00:00.000000Z',
        },
        {
            id: '6',
            status: 'complete',
            confidence: 'high',
            impact_short_term:
                'Handle 60% of tier-1'
                + ' inquiries automatically.'
                + ' Reduce agent workload'
                + ' significantly.',
            impact_mid_term:
                '40% reduction in support'
                + ' costs. Improved 24/7'
                + ' availability for'
                + ' customers.',
            impact_long_term:
                'Full self-service'
                + ' capability for common'
                + ' issues. Agents focus on'
                + ' complex cases only.',
            updated_at:
                '2024-02-28T14:30:00.000000Z',
        },
        {
            id: '7',
            status: 'draft',
            confidence: 'medium',
            impact_short_term:
                'Improved notification'
                + ' relevance reduces'
                + ' opt-outs. User'
                + ' engagement with pushes'
                + ' increases immediately.',
            impact_mid_term:
                'Personalized push'
                + ' strategy lifts daily'
                + ' active users and'
                + ' in-app conversion.',
            impact_long_term:
                'Notification system'
                + ' becomes a core'
                + ' retention channel with'
                + ' measurable revenue'
                + ' attribution.',
            updated_at:
                '2024-02-22'
                + 'T10:00:00.000000Z',
        },
        {
            id: '8',
            status: 'complete',
            confidence: 'high',
            impact_short_term:
                'Real-time visibility into'
                + ' energy and waste'
                + ' metrics. Quick wins'
                + ' identified in weeks.',
            impact_mid_term:
                'Operational changes cut'
                + ' energy costs by 15%.'
                + ' Sustainability reports'
                + ' become automated.',
            impact_long_term:
                'Company meets ESG targets'
                + ' ahead of schedule.'
                + ' Sustainability becomes'
                + ' a competitive edge.',
            updated_at:
                '2024-02-24'
                + 'T11:00:00.000000Z',
        },
        {
            id: '9',
            status: 'complete',
            confidence: 'medium',
            impact_short_term:
                'Live inventory counts'
                + ' replace manual audits.'
                + ' Discrepancy detection'
                + ' becomes instant.',
            impact_mid_term:
                'Warehouse efficiency'
                + ' improves 25% through'
                + ' real-time stock'
                + ' visibility and alerts.',
            impact_long_term:
                'End-to-end supply chain'
                + ' transparency enables'
                + ' just-in-time operations'
                + ' across all locations.',
            updated_at:
                '2024-02-26'
                + 'T09:00:00.000000Z',
        },
    ];

    const activities: ActivityEntity[] = [
        {
            id: '1',
            type: 'idea_scored',
            action: 'scored',
            target: 'AI-Powered Customer'
                + ' Support Bot',
            timestamp:
                '2024-02-28T17:50:00.000000Z',
            score: 87,
            status: 'high',
            comment:
                'Strong potential for'
                + ' cost reduction.',
        },
        {
            id: '2',
            type: 'task_completed',
            action: 'completed task',
            target: 'Design system audit',
            timestamp:
                '2024-02-28T17:35:00.000000Z',
            score: 0,
            status: 'completed',
            comment:
                'All components reviewed'
                + ' and documented.',
        },
        {
            id: '3',
            type: 'idea_created',
            action: 'submitted new idea',
            target: 'Mobile App Redesign',
            timestamp:
                '2024-02-28T17:00:00.000000Z',
            score: 0,
            status: 'active',
            comment:
                'Addresses top user'
                + ' feedback themes.',
        },
        {
            id: '4',
            type: 'comment_added',
            action: 'commented on',
            target:
                'Q1 Analytics Dashboard',
            timestamp:
                '2024-02-28T16:00:00.000000Z',
            score: 0,
            status: 'active',
            comment:
                'Great progress on the'
                + ' charts!',
        },
        {
            id: '5',
            type: 'user_joined',
            action: 'joined the team',
            target: 'Product Innovation',
            timestamp:
                '2024-02-28T15:00:00.000000Z',
            score: 0,
            status: 'active',
            comment:
                'Excited to contribute'
                + ' to the team.',
        },
        {
            id: '6',
            type: 'status_changed',
            action: 'changed status of',
            target:
                'Customer Feedback Portal',
            timestamp:
                '2024-02-28T14:00:00.000000Z',
            score: 0,
            status: 'In Progress',
            comment:
                'Development sprint'
                + ' started this week.',
        },
        {
            id: '7',
            type: 'idea_converted',
            action:
                'converted idea to project',
            target: 'Automated Testing'
                + ' Framework',
            timestamp:
                '2024-02-28T13:00:00.000000Z',
            score: 0,
            status: 'completed',
            comment:
                'Approved by engineering'
                + ' leadership.',
        },
        {
            id: '8',
            type: 'project_created',
            action: 'created new project',
            target: 'Performance'
                + ' Optimization Initiative',
            timestamp:
                '2024-02-28T12:00:00.000000Z',
            score: 0,
            status: 'active',
            comment:
                'Targeting 40% latency'
                + ' reduction.',
        },
        {
            id: '9',
            type: 'task_completed',
            action: 'completed task',
            target:
                'API documentation update',
            timestamp:
                '2024-02-27T18:00:00.000000Z',
            score: 0,
            status: 'completed',
            comment:
                'All endpoints documented'
                + ' with examples.',
        },
        {
            id: '10',
            type: 'idea_scored',
            action: 'scored',
            target: 'Data Pipeline'
                + ' Modernization',
            timestamp:
                '2024-02-27T15:00:00.000000Z',
            score: 92,
            status: 'high',
            comment:
                'Top priority for Q2'
                + ' roadmap.',
        },
    ];

    const crunchColumns:
        CrunchColumnEntity[] = [
        {
            id: '1',
            original_name: 'CUST_ID',
            friendly_name: 'Customer ID',
            data_type: 'text',
            description:
                'Unique identifier for'
                + ' each customer record.',
            sample_values: jsonArrayField(
                ['C001', 'C002', 'C003'],
            ),
        },
        {
            id: '2',
            original_name: 'TXN_DT',
            friendly_name:
                'Transaction Date',
            data_type: 'date',
            description:
                'Date when the transaction'
                + ' was recorded.',
            sample_values: jsonArrayField([
                '2024-01-15'
                    + 'T00:00:00.000000Z',
                '2024-01-16'
                    + 'T00:00:00.000000Z',
                '2024-01-17'
                    + 'T00:00:00.000000Z',
            ]),
        },
        {
            id: '3',
            original_name: 'AMT',
            friendly_name: 'Amount',
            data_type: 'number',
            description:
                'Monetary value of the'
                + ' transaction in USD.',
            sample_values: jsonArrayField(
                ['150.00', '299.99', '75.50'],
            ),
        },
        {
            id: '4',
            original_name: 'PROD_CAT',
            friendly_name:
                'Product Category',
            data_type: 'text',
            description:
                'Top-level category of'
                + ' the purchased product.',
            sample_values: jsonArrayField([
                'Electronics',
                'Apparel',
                'Home',
            ]),
        },
        {
            id: '5',
            original_name: 'REP_ID',
            friendly_name: 'Sales Rep ID',
            data_type: 'text',
            description:
                'Identifier for the sales'
                + ' representative who'
                + ' handled the order.',
            sample_values: jsonArrayField(
                ['R101', 'R102', 'R103'],
            ),
        },
        {
            id: '6',
            original_name: 'STATUS',
            friendly_name:
                'Transaction Status',
            data_type: 'text',
            description:
                'Current state of the'
                + ' transaction order.',
            sample_values: jsonArrayField(
                ['COMP', 'PEND', 'CANC'],
            ),
        },
    ];

    const crunchColumnAcronyms:
        CrunchColumnAcronymEntity[] = [
        { id: 'cca-1', expansion: '' },
        { id: 'cca-2', expansion: '' },
        { id: 'cca-3', expansion: '' },
        { id: 'cca-4', expansion: '' },
        { id: 'cca-5', expansion: '' },
    ];

    const crunchColumnAcronymLinks:
        CrunchColumnAcronymLinkEntity[] = [
        {
            id: 'ccal-1',
            crunch_column_acronym_id:
                'cca-1',
            crunch_column_id: '1',
            created_at:
                '2024-01-15'
                + 'T09:00:00.000000Z',
        },
        {
            id: 'ccal-2',
            crunch_column_acronym_id:
                'cca-2',
            crunch_column_id: '2',
            created_at:
                '2024-01-15'
                + 'T09:00:00.000000Z',
        },
        {
            id: 'ccal-3',
            crunch_column_acronym_id:
                'cca-3',
            crunch_column_id: '3',
            created_at:
                '2024-01-15'
                + 'T09:00:00.000000Z',
        },
        {
            id: 'ccal-4',
            crunch_column_acronym_id:
                'cca-4',
            crunch_column_id: '4',
            created_at:
                '2024-01-15'
                + 'T09:00:00.000000Z',
        },
        {
            id: 'ccal-5',
            crunch_column_acronym_id:
                'cca-5',
            crunch_column_id: '5',
            created_at:
                '2024-01-15'
                + 'T09:00:00.000000Z',
        },
    ];

    const processSteps:
        FlowStepEntity[] = [
        {
            id: 'ps1',
            title:
                'Receive signed contract',
            description:
                'Sales team sends signed'
                + ' contract to customer'
                + ' success inbox',
            owner: 'Sales Team',
            role: 'Account Executive',
            tools: jsonArrayField(
                ['Email', 'Document'],
            ),
            duration: 'Immediate',
            sort_order: 1,
            type: 'start',
        },
        {
            id: 'ps2',
            title:
                'Create customer record',
            description:
                'Enter customer details in'
                + ' CRM and create project'
                + ' folder',
            owner: 'Customer Success',
            role: 'CS Manager',
            tools: jsonArrayField(
                ['Database', 'Files'],
            ),
            duration: '15 minutes',
            sort_order: 2,
            type: 'action',
        },
        {
            id: 'ps3',
            title:
                'Schedule kickoff call',
            description:
                'Reach out to customer to'
                + ' schedule implementation'
                + ' kickoff',
            owner: 'Customer Success',
            role:
                'Implementation Specialist',
            tools: jsonArrayField(
                ['Email', 'Phone'],
            ),
            duration: '1 day',
            sort_order: 3,
            type: 'action',
        },
        {
            id: 'ps4',
            title:
                'Conduct kickoff meeting',
            description:
                'Review goals, timeline,'
                + ' and assign customer'
                + ' contacts',
            owner: 'Customer Success',
            role:
                'Implementation Specialist',
            tools: jsonArrayField(
                ['Chat', 'Document'],
            ),
            duration: '1 hour',
            sort_order: 4,
            type: 'action',
        },
        {
            id: 'ps5',
            title:
                'Technical setup complete',
            description:
                'Engineering confirms'
                + ' environment is ready for'
                + ' customer use',
            owner: 'Engineering',
            role: 'Solutions Engineer',
            tools: jsonArrayField(
                ['Database', 'Website'],
            ),
            duration: '2 days',
            sort_order: 5,
            type: 'action',
        },
        {
            id: 'ps6',
            title: 'Receive inbound lead',
            description:
                'New lead enters the'
                + ' system via form'
                + ' submission, referral, or'
                + ' marketing campaign',
            owner: 'Marketing',
            role: 'Marketing Ops',
            tools: jsonArrayField(
                ['Email', 'Database'],
            ),
            duration: 'Immediate',
            sort_order: 1,
            type: 'start',
        },
        {
            id: 'ps7',
            title: 'Initial lead scoring',
            description:
                'Automatically score lead'
                + ' based on firmographics,'
                + ' engagement, and fit'
                + ' criteria',
            owner: 'Marketing',
            role: 'Marketing Ops',
            tools: jsonArrayField(
                ['Database'],
            ),
            duration: '5 minutes',
            sort_order: 2,
            type: 'action',
        },
        {
            id: 'ps8',
            title:
                'Sales development'
                + ' outreach',
            description:
                'SDR contacts lead via'
                + ' email and phone to'
                + ' qualify interest and'
                + ' budget',
            owner: 'Sales',
            role: 'Sales Development Rep',
            tools: jsonArrayField(
                ['Email', 'Phone'],
            ),
            duration: '1-2 days',
            sort_order: 3,
            type: 'action',
        },
        {
            id: 'ps9',
            title: 'Discovery call',
            description:
                'Conduct structured'
                + ' discovery call to'
                + ' understand pain points'
                + ' and decision process',
            owner: 'Sales',
            role: 'Account Executive',
            tools: jsonArrayField(
                ['Phone', 'Chat', 'Document'],
            ),
            duration: '45 minutes',
            sort_order: 4,
            type: 'action',
        },
        {
            id: 'ps10',
            title:
                'Proposal and negotiation',
            description:
                'Prepare and present'
                + ' tailored proposal,'
                + ' negotiate terms and'
                + ' pricing',
            owner: 'Sales',
            role: 'Account Executive',
            tools: jsonArrayField(
                ['Document', 'Email'],
            ),
            duration: '3-5 days',
            sort_order: 5,
            type: 'action',
        },
        {
            id: 'ps11',
            title: 'Bug reported',
            description:
                'Bug is submitted via'
                + ' issue tracker with'
                + ' reproduction steps and'
                + ' severity',
            owner: 'QA',
            role: 'QA Engineer',
            tools: jsonArrayField(
                ['Database', 'Document'],
            ),
            duration: '15 minutes',
            sort_order: 1,
            type: 'start',
        },
        {
            id: 'ps12',
            title: 'Triage and classify',
            description:
                'Engineering lead reviews'
                + ' bug, assigns severity,'
                + ' priority, and owning'
                + ' team',
            owner: 'Engineering',
            role: 'Engineering Lead',
            tools: jsonArrayField(
                ['Database'],
            ),
            duration: '30 minutes',
            sort_order: 2,
            type: 'decision',
        },
        {
            id: 'ps13',
            title:
                'Reproduce and diagnose',
            description:
                'Developer reproduces the'
                + ' issue locally and'
                + ' identifies root cause',
            owner: 'Engineering',
            role: 'Software Engineer',
            tools: jsonArrayField(
                ['Database', 'Website'],
            ),
            duration: '1-4 hours',
            sort_order: 3,
            type: 'action',
        },
        {
            id: 'ps14',
            title: 'Implement fix',
            description:
                'Write code fix with unit'
                + ' tests, open pull request'
                + ' for review',
            owner: 'Engineering',
            role: 'Software Engineer',
            tools: jsonArrayField(
                ['Database', 'Document'],
            ),
            duration: '2-8 hours',
            sort_order: 4,
            type: 'action',
        },
        {
            id: 'ps15',
            title: 'Code review and QA',
            description:
                'Peer review of fix, QA'
                + ' verifies resolution in'
                + ' staging environment',
            owner: 'Engineering',
            role: 'Senior Engineer',
            tools: jsonArrayField(
                ['Database', 'Website'],
            ),
            duration: '1 day',
            sort_order: 5,
            type: 'action',
        },
        {
            id: 'ps16',
            title: 'Deploy and close',
            description:
                'Merge to main, deploy to'
                + ' production, close issue'
                + ' and notify reporter',
            owner: 'Engineering',
            role: 'DevOps Engineer',
            tools: jsonArrayField(
                ['Database', 'Email'],
            ),
            duration: '1 hour',
            sort_order: 6,
            type: 'end',
        },
        {
            id: 'ps17',
            title:
                'Gather retrospective data',
            description:
                'Collect performance'
                + ' metrics, OKR results,'
                + ' and team feedback from'
                + ' previous quarter',
            owner: 'Operations',
            role: 'Chief of Staff',
            tools: jsonArrayField(
                ['Database', 'Document'],
            ),
            duration: '3 days',
            sort_order: 1,
            type: 'start',
        },
        {
            id: 'ps18',
            title:
                'Leadership strategy'
                + ' session',
            description:
                'Executive team aligns on'
                + ' company priorities,'
                + ' resource allocation, and'
                + ' key initiatives',
            owner: 'Leadership',
            role: 'VP of Operations',
            tools: jsonArrayField(
                ['Chat', 'Document'],
            ),
            duration: '4 hours',
            sort_order: 2,
            type: 'action',
        },
        {
            id: 'ps19',
            title: 'Team OKR drafting',
            description:
                'Each department drafts'
                + ' quarterly OKRs aligned'
                + ' with company strategy',
            owner: 'All Departments',
            role: 'Department Leads',
            tools: jsonArrayField(
                ['Document'],
            ),
            duration: '1 week',
            sort_order: 3,
            type: 'action',
        },
        {
            id: 'ps20',
            title:
                'Cross-functional review'
                + ' and finalize',
            description:
                'Review OKRs across teams'
                + ' for alignment and'
                + ' dependencies, finalize'
                + ' commitments',
            owner: 'Operations',
            role: 'Chief of Staff',
            tools: jsonArrayField(
                ['Chat', 'Document'],
            ),
            duration: '2 days',
            sort_order: 4,
            type: 'end',
        },
    ];

    const processStepProcesses:
        ProcessStepProcessEntity[] = [
        {
            id: 'psp-ps1',
            process_step_id: 'ps1',
            process_id: '1',
            created_at:
                '2024-01-15T09:30:00.000000Z',
        },
        {
            id: 'psp-ps2',
            process_step_id: 'ps2',
            process_id: '1',
            created_at:
                '2024-01-15T09:30:00.000000Z',
        },
        {
            id: 'psp-ps3',
            process_step_id: 'ps3',
            process_id: '1',
            created_at:
                '2024-01-15T09:30:00.000000Z',
        },
        {
            id: 'psp-ps4',
            process_step_id: 'ps4',
            process_id: '1',
            created_at:
                '2024-01-15T09:30:00.000000Z',
        },
        {
            id: 'psp-ps5',
            process_step_id: 'ps5',
            process_id: '1',
            created_at:
                '2024-01-15T09:30:00.000000Z',
        },
        {
            id: 'psp-ps6',
            process_step_id: 'ps6',
            process_id: '2',
            created_at:
                '2024-01-15T09:30:00.000000Z',
        },
        {
            id: 'psp-ps7',
            process_step_id: 'ps7',
            process_id: '2',
            created_at:
                '2024-01-15T09:30:00.000000Z',
        },
        {
            id: 'psp-ps8',
            process_step_id: 'ps8',
            process_id: '2',
            created_at:
                '2024-01-15T09:30:00.000000Z',
        },
        {
            id: 'psp-ps9',
            process_step_id: 'ps9',
            process_id: '2',
            created_at:
                '2024-01-15T09:30:00.000000Z',
        },
        {
            id: 'psp-ps10',
            process_step_id: 'ps10',
            process_id: '2',
            created_at:
                '2024-01-15T09:30:00.000000Z',
        },
        {
            id: 'psp-ps11',
            process_step_id: 'ps11',
            process_id: '3',
            created_at:
                '2024-01-15T09:30:00.000000Z',
        },
        {
            id: 'psp-ps12',
            process_step_id: 'ps12',
            process_id: '3',
            created_at:
                '2024-01-15T09:30:00.000000Z',
        },
        {
            id: 'psp-ps13',
            process_step_id: 'ps13',
            process_id: '3',
            created_at:
                '2024-01-15T09:30:00.000000Z',
        },
        {
            id: 'psp-ps14',
            process_step_id: 'ps14',
            process_id: '3',
            created_at:
                '2024-01-15T09:30:00.000000Z',
        },
        {
            id: 'psp-ps15',
            process_step_id: 'ps15',
            process_id: '3',
            created_at:
                '2024-01-15T09:30:00.000000Z',
        },
        {
            id: 'psp-ps16',
            process_step_id: 'ps16',
            process_id: '3',
            created_at:
                '2024-01-15T09:30:00.000000Z',
        },
        {
            id: 'psp-ps17',
            process_step_id: 'ps17',
            process_id: '4',
            created_at:
                '2024-01-15T09:30:00.000000Z',
        },
        {
            id: 'psp-ps18',
            process_step_id: 'ps18',
            process_id: '4',
            created_at:
                '2024-01-15T09:30:00.000000Z',
        },
        {
            id: 'psp-ps19',
            process_step_id: 'ps19',
            process_id: '4',
            created_at:
                '2024-01-15T09:30:00.000000Z',
        },
        {
            id: 'psp-ps20',
            process_step_id: 'ps20',
            process_id: '4',
            created_at:
                '2024-01-15T09:30:00.000000Z',
        },
    ];

    await Promise.all([
        adapter.ideaScores.put('score-1', {
            id: 'score-1',
            overall: 82,
            impact_score: 88,
            impact_breakdown:
                jsonArrayField([
                    {
                        label:
                            'Business Value',
                        score: 9,
                        maxScore: 10,
                        reason:
                            'Direct revenue'
                            + ' impact through'
                            + ' improved'
                            + ' conversions',
                    },
                    {
                        label:
                            'Strategic'
                            + ' Alignment',
                        score: 8,
                        maxScore: 10,
                        reason:
                            'Supports digital'
                            + ' transformation'
                            + ' goals',
                    },
                    {
                        label:
                            'User Benefit',
                        score: 9,
                        maxScore: 10,
                        reason:
                            'Saves significant'
                            + ' time for'
                            + ' marketing team',
                    },
                ]),
            feasibility_score: 75,
            feasibility_breakdown:
                jsonArrayField([
                    {
                        label:
                            'Technical'
                            + ' Complexity',
                        score: 7,
                        maxScore: 10,
                        reason:
                            'Requires ML'
                            + ' expertise and'
                            + ' data pipeline',
                    },
                    {
                        label:
                            'Resource'
                            + ' Availability',
                        score: 8,
                        maxScore: 10,
                        reason:
                            'Team has relevant'
                            + ' skills',
                    },
                    {
                        label:
                            'Integration'
                            + ' Effort',
                        score: 8,
                        maxScore: 10,
                        reason:
                            'Works with'
                            + ' existing CRM',
                    },
                ]),
            efficiency_score: 85,
            efficiency_breakdown:
                jsonArrayField([
                    {
                        label:
                            'Time to Value',
                        score: 9,
                        maxScore: 10,
                        reason:
                            'MVP deliverable'
                            + ' in 6-8 weeks',
                    },
                    {
                        label:
                            'Cost Efficiency',
                        score: 8,
                        maxScore: 10,
                        reason:
                            'Reasonable'
                            + ' investment for'
                            + ' expected'
                            + ' returns',
                    },
                    {
                        label:
                            'Scalability',
                        score: 9,
                        maxScore: 10,
                        reason:
                            'Can expand to'
                            + ' other use cases',
                    },
                ]),
            estimated_duration: '6-8 weeks',
            estimated_cost:
                '$45,000 - $65,000',
            recommendation:
                'Strong candidate for'
                + ' immediate'
                + ' prioritization. High'
                + ' impact with manageable'
                + ' complexity. Recommend'
                + ' starting with a focused'
                + ' pilot on top customer'
                + ' segment.',
        }),
        ...projects.map(project =>
            adapter.projects.put(
                project.id,
                project,
            ),
        ),
        ...edges.map(edge =>
            adapter.edges.put(
                edge.id,
                edge,
            ),
        ),
        ...activities.map(activity =>
            adapter.activities.put(
                activity.id,
                activity,
            ),
        ),
        ...crunchColumns.map(column =>
            adapter.crunchColumns.put(
                column.id,
                column,
            ),
        ),
        ...crunchColumnAcronyms.map(a =>
            adapter.crunchColumnAcronyms.put(
                a.id, a,
            ),
        ),
        ...crunchColumnAcronymLinks.map(l =>
            adapter.crunchColumnAcronymLinks
                .put(l.id, l),
        ),
        ...processSteps.map(step =>
            adapter.flowSteps.put(
                step.id,
                step,
            ),
        ),
        ...processStepProcesses.map(link =>
            adapter.processStepProcesses.put(
                link.id, link,
            ),
        ),
    ]);

    const ideaScoreIdeas:
        IdeaScoreIdeaEntity[]
    = [
        {
            id: 'isi-1',
            idea_score_id: 'score-1',
            idea_id: '1',
            created_at:
                '2024-01-15'
                + 'T09:30:00.000000Z',
        },
    ];

    const teamMemberships: {
        id: string;
        project_id: string;
        user_id: string;
        role: string;
        type: string;
    }[] = [
        {
            id: 'tm-1-1',
            project_id: '1',
            user_id: '1',
            role: 'lead',
            type: 'business',
        },
        {
            id: 'tm-1-2',
            project_id: '1',
            user_id: '2',
            role: 'ML Engineer',
            type: 'engineering',
        },
        {
            id: 'tm-1-3',
            project_id: '1',
            user_id: '3',
            role: 'Data Scientist',
            type: 'engineering',
        },
        {
            id: 'tm-1-4',
            project_id: '1',
            user_id: '4',
            role: 'Backend Developer',
            type: 'engineering',
        },
        {
            id: 'tm-2-lead',
            project_id: '2',
            user_id: '2',
            role: 'lead',
            type: 'business',
        },
        {
            id: 'tm-3-lead',
            project_id: '3',
            user_id: '5',
            role: 'lead',
            type: 'business',
        },
        {
            id: 'tm-4-lead',
            project_id: '4',
            user_id: '8',
            role: 'lead',
            type: 'business',
        },
        {
            id: 'tm-5-lead',
            project_id: '5',
            user_id: '9',
            role: 'lead',
            type: 'business',
        },
        {
            id: 'tm-6-lead',
            project_id: '6',
            user_id: '3',
            role: 'lead',
            type: 'business',
        },
    ];

    const milestones = [
        {
            id: 'm1',
            title: 'Data Pipeline Setup',
            status: 'completed',
            date:
                '2024-01-30'
                + 'T00:00:00.000000Z',
            sort_order: 1,
        },
        {
            id: 'm2',
            title:
                'Model Training Complete',
            status: 'completed',
            date:
                '2024-02-15'
                + 'T00:00:00.000000Z',
            sort_order: 2,
        },
        {
            id: 'm3',
            title: 'Integration Testing',
            status: 'in_progress',
            date:
                '2024-03-01'
                + 'T00:00:00.000000Z',
            sort_order: 3,
        },
        {
            id: 'm4',
            title:
                'User Acceptance Testing',
            status: 'pending',
            date:
                '2024-03-20'
                + 'T00:00:00.000000Z',
            sort_order: 4,
        },
        {
            id: 'm5',
            title: 'Production Deployment',
            status: 'pending',
            date:
                '2024-04-01'
                + 'T00:00:00.000000Z',
            sort_order: 5,
        },
    ];

    const milestoneProjects:
        MilestoneProjectEntity[] = [
        {
            id: 'mp-m1',
            milestone_id: 'm1',
            project_id: '1',
            created_at:
                '2024-01-30'
                + 'T00:00:00.000000Z',
        },
        {
            id: 'mp-m2',
            milestone_id: 'm2',
            project_id: '1',
            created_at:
                '2024-02-15'
                + 'T00:00:00.000000Z',
        },
        {
            id: 'mp-m3',
            milestone_id: 'm3',
            project_id: '1',
            created_at:
                '2024-03-01'
                + 'T00:00:00.000000Z',
        },
        {
            id: 'mp-m4',
            milestone_id: 'm4',
            project_id: '1',
            created_at:
                '2024-03-20'
                + 'T00:00:00.000000Z',
        },
        {
            id: 'mp-m5',
            milestone_id: 'm5',
            project_id: '1',
            created_at:
                '2024-04-01'
                + 'T00:00:00.000000Z',
        },
    ];

    const tasks = [
        {
            id: 'task-1',
            name: 'Set up data pipeline',
            priority: 'High',
            description:
                'Configure ETL pipeline'
                + ' for customer data'
                + ' ingestion',
            skills: jsonArrayField([
                'Python',
                'Apache Airflow',
                'SQL',
            ]),
            duration: 86400,
        },
        {
            id: 'task-2',
            name: 'Train ML model',
            priority: 'High',
            description:
                'Develop and train'
                + ' clustering model using'
                + ' customer behavior data',
            skills: jsonArrayField([
                'Machine Learning',
                'Python',
                'scikit-learn',
            ]),
            duration: 144000,
        },
        {
            id: 'task-3',
            name: 'Design dashboard UI',
            priority: 'Medium',
            description:
                'Create visual interface'
                + ' for segment exploration'
                + ' and management',
            skills: jsonArrayField([
                'React',
                'D3.js',
                'CSS',
            ]),
            duration: 115200,
        },
        {
            id: 'task-4',
            name: 'Build API endpoints',
            priority: 'Medium',
            description:
                'RESTful API for segment'
                + ' data access and'
                + ' management',
            skills: jsonArrayField([
                'Node.js',
                'REST API',
                'PostgreSQL',
            ]),
            duration: 72000,
        },
        {
            id: 'task-5',
            name: 'Create documentation',
            priority: 'Low',
            description:
                'Technical documentation'
                + ' and user guides for the'
                + ' segmentation system',
            skills: jsonArrayField([
                'Technical Writing',
                'Markdown',
            ]),
            duration: 43200,
        },
    ];

    const discussions = [
        {
            id: 'd1',
            date:
                '2024-02-28'
                + 'T14:00:00.000000Z',
            message:
                'Great progress on the'
                + ' integration testing. We'
                + ' should be ready for UAT'
                + ' next week.',
        },
        {
            id: 'd2',
            date:
                '2024-02-25'
                + 'T10:30:00.000000Z',
            message:
                'Segmentation accuracy is'
                + ' now at 94%. Exceeding'
                + ' our initial target'
                + ' of 90%.',
        },
        {
            id: 'd3',
            date:
                '2024-02-20'
                + 'T16:00:00.000000Z',
            message:
                'API endpoints are ready'
                + ' for frontend'
                + ' integration.',
        },
    ];

    const versions = [
        {
            id: 'v1',
            version: 'v1.2',
            date:
                '2024-02-28'
                + 'T09:00:00.000000Z',
            changes:
                'Added real-time'
                + ' segmentation capability',
        },
        {
            id: 'v2',
            version: 'v1.1',
            date:
                '2024-02-15'
                + 'T09:00:00.000000Z',
            changes:
                'Improved model accuracy'
                + ' by 12%',
        },
        {
            id: 'v3',
            version: 'v1.0',
            date:
                '2024-01-30'
                + 'T09:00:00.000000Z',
            changes:
                'Initial model deployment',
        },
    ];

    const clarifications:
        ClarificationEntity[] = [
        {
            id: 'c1',
            question:
                'What data sources are'
                + ' currently available for'
                + ' customer behavior'
                + ' tracking? We need to'
                + ' understand the data'
                + ' pipeline before'
                + ' designing the ML model.',
            asked_at:
                '2024-02-20'
                + 'T10:00:00.000000Z',
            status: 'answered',
        },
        {
            id: 'c2',
            question:
                'Are there any existing'
                + ' segment definitions we'
                + ' should match, or are we'
                + ' free to discover optimal'
                + ' segments through'
                + ' clustering?',
            asked_at:
                '2024-02-22'
                + 'T09:30:00.000000Z',
            status: 'answered',
        },
        {
            id: 'c3',
            question:
                "What's the expected"
                + ' latency requirement for'
                + ' segment updates?'
                + ' Real-time vs batch'
                + ' processing has'
                + ' significant architecture'
                + ' implications.',
            asked_at:
                '2024-02-25'
                + 'T11:00:00.000000Z',
            status: 'pending',
        },
    ];

    const clarificationAnswers:
        ClarificationAnswerEntity[] = [
        {
            id: 'ca-c1',
            answer:
                'We have event tracking'
                + ' via Segment, transaction'
                + ' data in our data'
                + ' warehouse (Snowflake),'
                + ' and email engagement'
                + ' metrics from Mailchimp.'
                + ' All can be accessed'
                + ' via APIs.',
        },
        {
            id: 'ca-c2',
            answer:
                'Marketing has 5 legacy'
                + ' segments they use today'
                + ' (High Value, Growth,'
                + ' At-Risk, New, Dormant).'
                + " We'd like to preserve"
                + ' compatibility but'
                + ' welcome additional'
                + ' discovered segments.',
        },
    ];

    const clarificationAnswerClarifications:
        ClarificationAnswerClarificationEntity[]
        = [
            {
                id: 'cac-c1',
                clarification_answer_id:
                    'ca-c1',
                clarification_id: 'c1',
                created_at:
                    '2024-02-21'
                    + 'T14:00:00.000000Z',
            },
            {
                id: 'cac-c2',
                clarification_answer_id:
                    'ca-c2',
                clarification_id: 'c2',
                created_at:
                    '2024-02-22'
                    + 'T16:00:00.000000Z',
            },
        ];

    await Promise.all([
        ...teamMemberships.map(tm =>
            adapter.teamMemberships.put(
                tm.id,
                {
                    id: tm.id,
                    role: tm.role,
                    type: tm.type,
                },
            ),
        ),
        ...teamMemberships.map(tm =>
            adapter.teamMembershipProjects
                .put(`tmp-${tm.id}`, {
                    id: `tmp-${tm.id}`,
                    team_membership_id:
                        tm.id,
                    project_id:
                        tm.project_id,
                    created_at:
                        '2024-01-15'
                        + 'T09:00:00'
                        + '.000000Z',
                }),
        ),
        ...teamMemberships.map(tm =>
            adapter.teamMembershipUsers
                .put(`tmu-${tm.id}`, {
                    id: `tmu-${tm.id}`,
                    team_membership_id:
                        tm.id,
                    user_id: tm.user_id,
                    created_at:
                        '2024-01-15'
                        + 'T09:00:00'
                        + '.000000Z',
                }),
        ),
        ...milestones.map(milestone =>
            adapter.milestones.put(
                milestone.id,
                milestone,
            ),
        ),
        ...tasks.map(task =>
            adapter.projectTasks.put(
                task.id,
                task,
            ),
        ),
        ...discussions.map(discussion =>
            adapter.discussions.put(
                discussion.id,
                discussion,
            ),
        ),
        ...versions.map(version =>
            adapter.projectVersions.put(
                version.id,
                version,
            ),
        ),
        ...clarifications.map(c =>
            adapter.clarifications.put(
                c.id,
                c,
            ),
        ),
        adapter.edgeOutcomes.put('eo1', {
            description:
                'Reduce customer churn'
                + ' rate',
        }),
        adapter.edgeOutcomes.put('eo2', {
            description:
                'Increase marketing ROI',
        }),
        adapter.edgeOutcomes.put('eo3', {
            description:
                'Automate report'
                + ' generation',
        }),
        adapter.edgeOutcomes.put('eo4', {
            description:
                'Reduce manual effort',
        }),
        adapter.edgeOutcomes.put('eo5', {
            description:
                'Improve data quality',
        }),
        adapter.edgeOutcomes.put('eo6', {
            description:
                'Predict equipment'
                + ' failures',
        }),
        adapter.edgeOutcomes.put('eo7', {
            description:
                'Real-time data'
                + ' visibility',
        }),
        adapter.edgeOutcomes.put('eo8', {
            description:
                'Improve decision speed',
        }),
        adapter.edgeOutcomes.put('eo9', {
            description:
                'Reduce support ticket'
                + ' volume',
        }),
        adapter.edgeOutcomes.put('eo10', {
            description:
                'Improve customer'
                + ' satisfaction',
        }),
    ]);

    await Promise.all([
        adapter.edgeMetrics.put('em1', {
            name: 'Churn Rate Reduction',
            target: '15',
            unit: '%',
            current: '12',
        }),
        adapter.edgeMetrics.put('em2', {
            name: 'Customer Retention',
            target: '85',
            unit: '%',
            current: '82',
        }),
        adapter.edgeMetrics.put('em3', {
            name: 'Campaign Conversion',
            target: '25',
            unit: '%',
            current: '28',
        }),
        adapter.edgeMetrics.put('em4', {
            name: 'Cost per Acquisition',
            target: '45',
            unit: '$',
            current: '42',
        }),
        adapter.edgeMetrics.put('em5', {
            name: 'Report Time',
            target: '5',
            unit: 'min',
            current: '8',
        }),
        adapter.edgeMetrics.put('em6', {
            name: 'Accuracy',
            target: '99',
            unit: '%',
            current: '95',
        }),
        adapter.edgeMetrics.put('em7', {
            name: 'Effort Reduction',
            target: '80',
            unit: '%',
            current: '60',
        }),
        adapter.edgeMetrics.put('em8', {
            name: 'Data Quality',
            target: '95',
            unit: '%',
            current: '88',
        }),
        adapter.edgeMetrics.put('em9', {
            name: 'Error Rate',
            target: '1',
            unit: '%',
            current: '3',
        }),
        adapter.edgeMetrics.put('em10', {
            name: 'Detection Rate',
            target: '90',
            unit: '%',
            current: '45',
        }),
        adapter.edgeMetrics.put('em11', {
            name: 'False Positive Rate',
            target: '5',
            unit: '%',
            current: '15',
        }),
        adapter.edgeMetrics.put('em12', {
            name: 'Dashboard Load',
            target: '2',
            unit: 's',
            current: '3',
        }),
        adapter.edgeMetrics.put('em13', {
            name: 'Decision Time',
            target: '1',
            unit: 'hr',
            current: '4',
        }),
        adapter.edgeMetrics.put('em14', {
            name: 'Data Freshness',
            target: '5',
            unit: 'min',
            current: '30',
        }),
        adapter.edgeMetrics.put('em15', {
            name: 'Ticket Reduction',
            target: '40',
            unit: '%',
            current: '18',
        }),
        adapter.edgeMetrics.put('em16', {
            name: 'First Response Time',
            target: '1',
            unit: 'min',
            current: '3',
        }),
        adapter.edgeMetrics.put('em17', {
            name: 'CSAT Score',
            target: '4.5',
            unit: '/5',
            current: '3.8',
        }),
        adapter.edgeMetrics.put('em18', {
            name: 'Resolution Rate',
            target: '85',
            unit: '%',
            current: '72',
        }),
    ]);

    const ideaSubmissions:
        IdeaSubmissionEntity[] = [
        {
            id: 'is-1',
            idea_id: '1',
            user_id: '1',
            created_at:
                '2024-01-15T09:30:00.000000Z',
        },
        {
            id: 'is-2',
            idea_id: '2',
            user_id: '2',
            created_at:
                '2024-01-20T09:00:00.000000Z',
        },
        {
            id: 'is-3',
            idea_id: '3',
            user_id: '5',
            created_at:
                '2024-01-25T09:00:00.000000Z',
        },
        {
            id: 'is-4',
            idea_id: '4',
            user_id: '8',
            created_at:
                '2024-02-01T09:00:00.000000Z',
        },
        {
            id: 'is-5',
            idea_id: '5',
            user_id: '9',
            created_at:
                '2024-02-05T09:00:00.000000Z',
        },
        {
            id: 'is-6',
            idea_id: '6',
            user_id: '3',
            created_at:
                '2024-02-10T09:00:00.000000Z',
        },
        {
            id: 'is-7',
            idea_id: '7',
            user_id: '1',
            created_at:
                '2024-01-15T10:00:00.000000Z',
        },
        {
            id: 'is-8',
            idea_id: '8',
            user_id: '7',
            created_at:
                '2024-02-15T09:00:00.000000Z',
        },
        {
            id: 'is-9',
            idea_id: '9',
            user_id: '5',
            created_at:
                '2024-02-18T09:00:00.000000Z',
        },
        {
            id: 'is-10',
            idea_id: '10',
            user_id: '8',
            created_at:
                '2024-02-20T09:00:00.000000Z',
        },
        {
            id: 'is-11',
            idea_id: '11',
            user_id: '9',
            created_at:
                '2024-02-22T09:00:00.000000Z',
        },
    ];

    const ideaProjectLinks:
        IdeaProjectLinkEntity[] = [
        {
            id: 'ipl-1',
            idea_id: '1',
            project_id: '1',
            created_at:
                '2024-01-15T00:00:00.000000Z',
        },
        {
            id: 'ipl-2',
            idea_id: '2',
            project_id: '2',
            created_at:
                '2024-01-20T00:00:00.000000Z',
        },
        {
            id: 'ipl-3',
            idea_id: '3',
            project_id: '3',
            created_at:
                '2024-01-25T00:00:00.000000Z',
        },
        {
            id: 'ipl-4',
            idea_id: '4',
            project_id: '4',
            created_at:
                '2024-02-01T00:00:00.000000Z',
        },
        {
            id: 'ipl-5',
            idea_id: '5',
            project_id: '5',
            created_at:
                '2024-02-05T00:00:00.000000Z',
        },
        {
            id: 'ipl-6',
            idea_id: '6',
            project_id: '6',
            created_at:
                '2024-02-10T00:00:00.000000Z',
        },
    ];

    const edgeIdeas:
        EdgeIdeaEntity[] = [
        {
            id: 'ei-1',
            edge_id: '1',
            idea_id: '1',
            created_at:
                '2024-02-28'
                + 'T14:30:00.000000Z',
        },
        {
            id: 'ei-2',
            edge_id: '2',
            idea_id: '2',
            created_at:
                '2024-02-25'
                + 'T10:00:00.000000Z',
        },
        {
            id: 'ei-3',
            edge_id: '3',
            idea_id: '3',
            created_at:
                '2024-02-20'
                + 'T09:00:00.000000Z',
        },
        {
            id: 'ei-4',
            edge_id: '4',
            idea_id: '4',
            created_at:
                '2024-02-18'
                + 'T11:00:00.000000Z',
        },
        {
            id: 'ei-5',
            edge_id: '5',
            idea_id: '5',
            created_at:
                '2024-02-15'
                + 'T09:00:00.000000Z',
        },
        {
            id: 'ei-6',
            edge_id: '6',
            idea_id: '7',
            created_at:
                '2024-02-28'
                + 'T14:30:00.000000Z',
        },
        {
            id: 'ei-7',
            edge_id: '7',
            idea_id: '8',
            created_at:
                '2024-02-22'
                + 'T10:00:00.000000Z',
        },
        {
            id: 'ei-8',
            edge_id: '8',
            idea_id: '9',
            created_at:
                '2024-02-24'
                + 'T11:00:00.000000Z',
        },
        {
            id: 'ei-9',
            edge_id: '9',
            idea_id: '11',
            created_at:
                '2024-02-26'
                + 'T09:00:00.000000Z',
        },
    ];

    const edgeOwnerships:
        EdgeOwnershipEntity[] = [
        {
            id: 'eo-own-1',
            edge_id: '1',
            user_id: '1',
            created_at:
                '2024-02-28T14:30:00.000000Z',
        },
        {
            id: 'eo-own-2',
            edge_id: '2',
            user_id: '2',
            created_at:
                '2024-02-25T10:00:00.000000Z',
        },
        {
            id: 'eo-own-3',
            edge_id: '3',
            user_id: '5',
            created_at:
                '2024-02-20T09:00:00.000000Z',
        },
        {
            id: 'eo-own-4',
            edge_id: '4',
            user_id: '8',
            created_at:
                '2024-02-18T11:00:00.000000Z',
        },
        {
            id: 'eo-own-6',
            edge_id: '6',
            user_id: '1',
            created_at:
                '2024-02-28T14:30:00.000000Z',
        },
    ];

    const edgeOutcomeEdges:
        EdgeOutcomeEdgeEntity[] = [
        {
            id: 'eoe-eo1',
            edge_outcome_id: 'eo1',
            edge_id: '1',
            created_at:
                '2024-02-28'
                + 'T14:30:00.000000Z',
        },
        {
            id: 'eoe-eo2',
            edge_outcome_id: 'eo2',
            edge_id: '1',
            created_at:
                '2024-02-28'
                + 'T14:30:00.000000Z',
        },
        {
            id: 'eoe-eo3',
            edge_outcome_id: 'eo3',
            edge_id: '2',
            created_at:
                '2024-02-25'
                + 'T10:00:00.000000Z',
        },
        {
            id: 'eoe-eo4',
            edge_outcome_id: 'eo4',
            edge_id: '2',
            created_at:
                '2024-02-25'
                + 'T10:00:00.000000Z',
        },
        {
            id: 'eoe-eo5',
            edge_outcome_id: 'eo5',
            edge_id: '2',
            created_at:
                '2024-02-25'
                + 'T10:00:00.000000Z',
        },
        {
            id: 'eoe-eo6',
            edge_outcome_id: 'eo6',
            edge_id: '3',
            created_at:
                '2024-02-20'
                + 'T09:00:00.000000Z',
        },
        {
            id: 'eoe-eo7',
            edge_outcome_id: 'eo7',
            edge_id: '4',
            created_at:
                '2024-02-18'
                + 'T11:00:00.000000Z',
        },
        {
            id: 'eoe-eo8',
            edge_outcome_id: 'eo8',
            edge_id: '4',
            created_at:
                '2024-02-18'
                + 'T11:00:00.000000Z',
        },
        {
            id: 'eoe-eo9',
            edge_outcome_id: 'eo9',
            edge_id: '6',
            created_at:
                '2024-02-28'
                + 'T14:30:00.000000Z',
        },
        {
            id: 'eoe-eo10',
            edge_outcome_id: 'eo10',
            edge_id: '6',
            created_at:
                '2024-02-28'
                + 'T14:30:00.000000Z',
        },
    ];

    const edgeMetricOutcomes:
        EdgeMetricOutcomeEntity[] = [
        {
            id: 'emo-em1',
            edge_metric_id: 'em1',
            outcome_id: 'eo1',
            created_at:
                '2024-02-28'
                + 'T14:30:00.000000Z',
        },
        {
            id: 'emo-em2',
            edge_metric_id: 'em2',
            outcome_id: 'eo1',
            created_at:
                '2024-02-28'
                + 'T14:30:00.000000Z',
        },
        {
            id: 'emo-em3',
            edge_metric_id: 'em3',
            outcome_id: 'eo2',
            created_at:
                '2024-02-28'
                + 'T14:30:00.000000Z',
        },
        {
            id: 'emo-em4',
            edge_metric_id: 'em4',
            outcome_id: 'eo2',
            created_at:
                '2024-02-28'
                + 'T14:30:00.000000Z',
        },
        {
            id: 'emo-em5',
            edge_metric_id: 'em5',
            outcome_id: 'eo3',
            created_at:
                '2024-02-25'
                + 'T10:00:00.000000Z',
        },
        {
            id: 'emo-em6',
            edge_metric_id: 'em6',
            outcome_id: 'eo3',
            created_at:
                '2024-02-25'
                + 'T10:00:00.000000Z',
        },
        {
            id: 'emo-em7',
            edge_metric_id: 'em7',
            outcome_id: 'eo4',
            created_at:
                '2024-02-25'
                + 'T10:00:00.000000Z',
        },
        {
            id: 'emo-em8',
            edge_metric_id: 'em8',
            outcome_id: 'eo5',
            created_at:
                '2024-02-25'
                + 'T10:00:00.000000Z',
        },
        {
            id: 'emo-em9',
            edge_metric_id: 'em9',
            outcome_id: 'eo5',
            created_at:
                '2024-02-25'
                + 'T10:00:00.000000Z',
        },
        {
            id: 'emo-em10',
            edge_metric_id: 'em10',
            outcome_id: 'eo6',
            created_at:
                '2024-02-20'
                + 'T09:00:00.000000Z',
        },
        {
            id: 'emo-em11',
            edge_metric_id: 'em11',
            outcome_id: 'eo6',
            created_at:
                '2024-02-20'
                + 'T09:00:00.000000Z',
        },
        {
            id: 'emo-em12',
            edge_metric_id: 'em12',
            outcome_id: 'eo7',
            created_at:
                '2024-02-18'
                + 'T11:00:00.000000Z',
        },
        {
            id: 'emo-em13',
            edge_metric_id: 'em13',
            outcome_id: 'eo8',
            created_at:
                '2024-02-18'
                + 'T11:00:00.000000Z',
        },
        {
            id: 'emo-em14',
            edge_metric_id: 'em14',
            outcome_id: 'eo8',
            created_at:
                '2024-02-18'
                + 'T11:00:00.000000Z',
        },
        {
            id: 'emo-em15',
            edge_metric_id: 'em15',
            outcome_id: 'eo9',
            created_at:
                '2024-02-28'
                + 'T14:30:00.000000Z',
        },
        {
            id: 'emo-em16',
            edge_metric_id: 'em16',
            outcome_id: 'eo9',
            created_at:
                '2024-02-28'
                + 'T14:30:00.000000Z',
        },
        {
            id: 'emo-em17',
            edge_metric_id: 'em17',
            outcome_id: 'eo10',
            created_at:
                '2024-02-28'
                + 'T14:30:00.000000Z',
        },
        {
            id: 'emo-em18',
            edge_metric_id: 'em18',
            outcome_id: 'eo10',
            created_at:
                '2024-02-28'
                + 'T14:30:00.000000Z',
        },
    ];

    const taskAssignments:
        TaskAssignmentEntity[] = [
        {
            id: 'ta-1',
            task_id: 'task-1',
            user_id: '2',
            created_at:
                '2024-01-15'
                + 'T00:00:00.000000Z',
        },
    ];

    const projectTaskProjects:
        ProjectTaskProjectEntity[] = [
        {
            id: 'ptp-1',
            project_task_id: 'task-1',
            project_id: '1',
            created_at:
                '2024-01-15'
                + 'T00:00:00.000000Z',
        },
        {
            id: 'ptp-2',
            project_task_id: 'task-2',
            project_id: '1',
            created_at:
                '2024-01-15'
                + 'T00:00:00.000000Z',
        },
        {
            id: 'ptp-3',
            project_task_id: 'task-3',
            project_id: '1',
            created_at:
                '2024-01-15'
                + 'T00:00:00.000000Z',
        },
        {
            id: 'ptp-4',
            project_task_id: 'task-4',
            project_id: '1',
            created_at:
                '2024-01-15'
                + 'T00:00:00.000000Z',
        },
        {
            id: 'ptp-5',
            project_task_id: 'task-5',
            project_id: '1',
            created_at:
                '2024-01-15'
                + 'T00:00:00.000000Z',
        },
    ];

    const discussionAuthorships:
        DiscussionAuthorshipEntity[] = [
        {
            id: 'da-1',
            discussion_id: 'd1',
            user_id: '1',
            created_at:
                '2024-02-28T14:00:00.000000Z',
        },
        {
            id: 'da-2',
            discussion_id: 'd2',
            user_id: '2',
            created_at:
                '2024-02-25T10:30:00.000000Z',
        },
        {
            id: 'da-3',
            discussion_id: 'd3',
            user_id: '4',
            created_at:
                '2024-02-20T16:00:00.000000Z',
        },
    ];

    const discussionProjects:
        DiscussionProjectEntity[] = [
        {
            id: 'dp-d1',
            discussion_id: 'd1',
            project_id: '1',
            created_at:
                '2024-02-28'
                + 'T14:00:00.000000Z',
        },
        {
            id: 'dp-d2',
            discussion_id: 'd2',
            project_id: '1',
            created_at:
                '2024-02-25'
                + 'T10:30:00.000000Z',
        },
        {
            id: 'dp-d3',
            discussion_id: 'd3',
            project_id: '1',
            created_at:
                '2024-02-20'
                + 'T16:00:00.000000Z',
        },
    ];

    const versionAuthorships:
        VersionAuthorshipEntity[] = [
        {
            id: 'va-1',
            version_id: 'v1',
            user_id: '2',
            created_at:
                '2024-02-28T09:00:00.000000Z',
        },
        {
            id: 'va-2',
            version_id: 'v2',
            user_id: '3',
            created_at:
                '2024-02-15T09:00:00.000000Z',
        },
        {
            id: 'va-3',
            version_id: 'v3',
            user_id: '1',
            created_at:
                '2024-01-30T09:00:00.000000Z',
        },
    ];

    const projectVersionProjects:
        ProjectVersionProjectEntity[] = [
        {
            id: 'pvp-v1',
            project_version_id: 'v1',
            project_id: '1',
            created_at:
                '2024-02-28'
                + 'T09:00:00.000000Z',
        },
        {
            id: 'pvp-v2',
            project_version_id: 'v2',
            project_id: '1',
            created_at:
                '2024-02-15'
                + 'T09:00:00.000000Z',
        },
        {
            id: 'pvp-v3',
            project_version_id: 'v3',
            project_id: '1',
            created_at:
                '2024-01-30'
                + 'T09:00:00.000000Z',
        },
    ];

    const activityActors:
        ActivityActorEntity[] = [
        {
            id: 'aa-1',
            activity_id: '1',
            user_id: '1',
            created_at:
                '2024-02-28T17:50:00.000000Z',
        },
        {
            id: 'aa-2',
            activity_id: '2',
            user_id: '7',
            created_at:
                '2024-02-28T17:35:00.000000Z',
        },
        {
            id: 'aa-3',
            activity_id: '3',
            user_id: '5',
            created_at:
                '2024-02-28T17:00:00.000000Z',
        },
        {
            id: 'aa-4',
            activity_id: '4',
            user_id: '4',
            created_at:
                '2024-02-28T16:00:00.000000Z',
        },
        {
            id: 'aa-5',
            activity_id: '5',
            user_id: '6',
            created_at:
                '2024-02-28T15:00:00.000000Z',
        },
        {
            id: 'aa-6',
            activity_id: '6',
            user_id: '9',
            created_at:
                '2024-02-28T14:00:00.000000Z',
        },
        {
            id: 'aa-7',
            activity_id: '7',
            user_id: '10',
            created_at:
                '2024-02-28T13:00:00.000000Z',
        },
        {
            id: 'aa-8',
            activity_id: '8',
            user_id: '1',
            created_at:
                '2024-02-28T12:00:00.000000Z',
        },
        {
            id: 'aa-9',
            activity_id: '9',
            user_id: '5',
            created_at:
                '2024-02-27T18:00:00.000000Z',
        },
        {
            id: 'aa-10',
            activity_id: '10',
            user_id: '7',
            created_at:
                '2024-02-27T15:00:00.000000Z',
        },
    ];

    const clarificationProjects:
        ClarificationProjectEntity[] = [
        {
            id: 'cp-c1',
            clarification_id: 'c1',
            project_id: '1',
            created_at:
                '2024-01-15'
                + 'T09:30:00.000000Z',
        },
        {
            id: 'cp-c2',
            clarification_id: 'c2',
            project_id: '1',
            created_at:
                '2024-01-15'
                + 'T09:30:00.000000Z',
        },
        {
            id: 'cp-c3',
            clarification_id: 'c3',
            project_id: '1',
            created_at:
                '2024-01-15'
                + 'T09:30:00.000000Z',
        },
    ];

    const clarificationAskers:
        ClarificationAskerEntity[] = [
        {
            id: 'ca-1',
            clarification_id: 'c1',
            user_id: '2',
            created_at:
                '2024-02-20T10:00:00.000000Z',
        },
        {
            id: 'ca-2',
            clarification_id: 'c2',
            user_id: '3',
            created_at:
                '2024-02-22T09:30:00.000000Z',
        },
        {
            id: 'ca-3',
            clarification_id: 'c3',
            user_id: '4',
            created_at:
                '2024-02-25T11:00:00.000000Z',
        },
    ];

    const clarificationAnswerers:
        ClarificationAnswererEntity[] = [
        {
            id: 'cans-1',
            clarification_id: 'c1',
            user_id: '1',
            created_at:
                '2024-02-21T14:00:00.000000Z',
        },
        {
            id: 'cans-2',
            clarification_id: 'c2',
            user_id: '1',
            created_at:
                '2024-02-22T16:00:00.000000Z',
        },
    ];

    await Promise.all([
        ...ideaScoreIdeas.map(r =>
            adapter.ideaScoreIdeas.put(
                r.id, r,
            ),
        ),
        ...ideaSubmissions.map(r =>
            adapter.ideaSubmissions.put(
                r.id, r,
            ),
        ),
        ...ideaProjectLinks.map(r =>
            adapter.ideaProjectLinks.put(
                r.id, r,
            ),
        ),
        ...edgeIdeas.map(r =>
            adapter.edgeIdeas.put(
                r.id, r,
            ),
        ),
        ...edgeOwnerships.map(r =>
            adapter.edgeOwnerships.put(
                r.id, r,
            ),
        ),
        ...edgeOutcomeEdges.map(r =>
            adapter.edgeOutcomeEdges.put(
                r.id, r,
            ),
        ),
        ...edgeMetricOutcomes.map(r =>
            adapter.edgeMetricOutcomes.put(
                r.id, r,
            ),
        ),
        ...taskAssignments.map(r =>
            adapter.taskAssignments.put(
                r.id, r,
            ),
        ),
        ...projectTaskProjects.map(r =>
            adapter.projectTaskProjects.put(
                r.id, r,
            ),
        ),
        ...discussionAuthorships.map(r =>
            adapter.discussionAuthorships.put(
                r.id, r,
            ),
        ),
        ...discussionProjects.map(r =>
            adapter.discussionProjects.put(
                r.id, r,
            ),
        ),
        ...versionAuthorships.map(r =>
            adapter.versionAuthorships.put(
                r.id, r,
            ),
        ),
        ...activityActors.map(r =>
            adapter.activityActors.put(
                r.id, r,
            ),
        ),
        ...clarificationProjects.map(r =>
            adapter.clarificationProjects.put(
                r.id, r,
            ),
        ),
        ...clarificationAskers.map(r =>
            adapter.clarificationAskers.put(
                r.id, r,
            ),
        ),
        ...clarificationAnswers.map(r =>
            adapter.clarificationAnswers.put(
                r.id, r,
            ),
        ),
        ...clarificationAnswerClarifications
            .map(r =>
                adapter
                    .clarificationAnswerClarifications
                    .put(r.id, r),
            ),
        ...clarificationAnswerers.map(r =>
            adapter.clarificationAnswerers.put(
                r.id, r,
            ),
        ),
        ...milestoneProjects.map(r =>
            adapter.milestoneProjects.put(
                r.id, r,
            ),
        ),
        ...projectVersionProjects.map(r =>
            adapter
                .projectVersionProjects
                .put(r.id, r),
        ),
    ]);
}
