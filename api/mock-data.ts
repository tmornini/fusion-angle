import type { DbAdapter } from './db';
import type {
    UserEntity,
    UserStatus,
    ReadinessLevel,
    IdeaEntity,
    ProjectEntity,
    ActivityEntity,
    IdeaSubmissionEntity,
    ActivityActorEntity,
    FlowEntity,
    WfNodeEntity,
    WfEdgeEntity,
    WfFieldEntity,
    ProjectFlowEntity,
    WfFlowNodeEntity,
    WfNodeEdgeEntity,
    WfNodeFieldEntity,
} from './types';
import {
    jsonArrayField,
    jsonObjectField,
} from './types';

const now = new Date();

function pad(n: number): string {
    return String(n).padStart(2, '0');
}

function dt(
    daysAgo: number,
    hour = 9,
    minute = 0,
): string {
    const d = new Date(Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() - daysAgo,
        hour,
        minute,
    ));
    const y = d.getUTCFullYear();
    const mo = pad(d.getUTCMonth() + 1);
    const da = pad(d.getUTCDate());
    const h = pad(d.getUTCHours());
    const mi = pad(d.getUTCMinutes());
    return `${y}-${mo}-${da}`
        + `T${h}:${mi}:00.000000Z`;
}

type SeedUser = Omit<
    UserEntity,
    'strengths' | 'team_dimensions'
> & {
    strengths: string[];
    team_dimensions: Record<
        string, number
    >;
};

export async function populateMockData(
    adapter: DbAdapter,
): Promise<void> {
    const users: SeedUser[] = [
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
            last_active: dt(0, 16),
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
            last_active: dt(1, 15, 30),
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
            last_active: dt(0, 17),
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
            last_active: dt(0, 14),
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
            last_active: dt(0, 9, 15),
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
            last_active: dt(0, 11, 45),
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
            last_active: dt(0, 17, 30),
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
            last_active: dt(2, 14),
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
            last_active: dt(1, 18),
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
            last_active: dt(7, 18),
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
            last_active: dt(0, 18),
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
            estimated_impact: 65,
            estimated_duration: 324000,
            estimated_cost: 35000,
            priority: 6,
            status: 'sent-back',

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
            next_billing: dt(-300, 0),
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
            last_activity: dt(0, 16),
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
            start_date: dt(60, 0),
            target_end_date: dt(-30, 0),
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
            status: 'completed',
            progress: 100,
            start_date: dt(90),
            target_end_date: dt(57),
            estimated_duration: 288000,
            actual_duration: 216000,
            estimated_cost: 32000,
            actual_cost: 28000,
            estimated_impact: 78,
            actual_impact: 82,
            priority: 2,
            priority_score: 87,
            business_context: jsonObjectField({}),
            timeline_label: 'Completed',
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
            start_date: dt(45),
            target_end_date: dt(-28),
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
            status: 'completed',
            progress: 100,
            start_date: dt(75),
            target_end_date: dt(47),
            estimated_duration: 216000,
            actual_duration: 198000,
            estimated_cost: 28000,
            actual_cost: 26000,
            estimated_impact: 72,
            actual_impact: 70,
            priority: 4,
            priority_score: 81,
            business_context: jsonObjectField({}),
            timeline_label: 'Completed',
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
            start_date: dt(50),
            target_end_date: dt(7),
            estimated_duration: 360000,
            actual_duration: 108000,
            estimated_cost: 38000,
            actual_cost: 12000,
            estimated_impact: 68,
            actual_impact: 0,
            priority: 5,
            priority_score: 78,
            business_context: jsonObjectField({}),
            timeline_label: 'Overdue',
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
            start_date: dt(14),
            target_end_date: dt(-28),
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

    const activities: ActivityEntity[] = [
        {
            id: '3',
            type: 'idea_created',
            action: 'submitted new idea',
            target: 'Mobile App Redesign',
            timestamp: dt(0, 17),
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
            timestamp: dt(0, 16),
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
            timestamp: dt(0, 15),
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
            timestamp: dt(0, 14),
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
            timestamp: dt(0, 13),
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
            timestamp: dt(0, 12),
            score: 0,
            status: 'active',
            comment:
                'Targeting 40% latency'
                + ' reduction.',
        },
    ];

    const wfTimestamp = dt(60);

    const mockFlows:
        FlowEntity[] = [
        {
            id: 'wf-1',
            name: 'Customer Onboarding',
            description:
                'Standard customer'
                + ' onboarding process',
            created_at: wfTimestamp,
            updated_at: wfTimestamp,
        },
    ];

    const mockWfNodes:
        WfNodeEntity[] = [
        {
            id: 'wn-1',
            name: 'New',
            description: '',
            position_x: 40,
            position_y: 30,
            is_start: 1,
            is_complete: 0,
            created_at: wfTimestamp,
        },
        {
            id: 'wn-2',
            name: 'Data Capture',
            description: '',
            position_x: 260,
            position_y: 140,
            is_start: 0,
            is_complete: 0,
            created_at: wfTimestamp,
        },
        {
            id: 'wn-3',
            name: 'Review',
            description: '',
            position_x: 480,
            position_y: 250,
            is_start: 0,
            is_complete: 0,
            created_at: wfTimestamp,
        },
        {
            id: 'wn-4',
            name: 'Complete',
            description: '',
            position_x: 680,
            position_y: 370,
            is_start: 0,
            is_complete: 1,
            created_at: wfTimestamp,
        },
    ];

    const mockWfEdges:
        WfEdgeEntity[] = [
        {
            id: 'we-1',
            name: 'begin',
            description: '',
            created_at: wfTimestamp,
        },
        {
            id: 'we-2',
            name: 'submit',
            description: '',
            created_at: wfTimestamp,
        },
        {
            id: 'we-3',
            name: 'needs revision',
            description: '',
            created_at: wfTimestamp,
        },
        {
            id: 'we-4',
            name: 'approve',
            description: '',
            created_at: wfTimestamp,
        },
    ];

    const mockWfFields:
        WfFieldEntity[] = [
        {
            id: 'wff-1',
            name: 'Company Name',
            field_type: 'text',
            sort_order: 1,
            is_required: 1,
            options: jsonArrayField([]),
            created_at: wfTimestamp,
        },
        {
            id: 'wff-2',
            name: 'Contact Email',
            field_type: 'email',
            sort_order: 2,
            is_required: 1,
            options: jsonArrayField([]),
            created_at: wfTimestamp,
        },
        {
            id: 'wff-3',
            name: 'Contact Phone',
            field_type: 'phone',
            sort_order: 3,
            is_required: 0,
            options: jsonArrayField([]),
            created_at: wfTimestamp,
        },
        {
            id: 'wff-4',
            name: 'Industry',
            field_type: 'select',
            sort_order: 4,
            is_required: 0,
            options: jsonArrayField([
                'Technology',
                'Finance',
                'Healthcare',
                'Retail',
                'Manufacturing',
            ]),
            created_at: wfTimestamp,
        },
        {
            id: 'wff-5',
            name: 'Annual Revenue',
            field_type: 'currency',
            sort_order: 5,
            is_required: 0,
            options: jsonArrayField([]),
            created_at: wfTimestamp,
        },
        {
            id: 'wff-6',
            name: 'Number of Employees',
            field_type: 'number',
            sort_order: 6,
            is_required: 0,
            options: jsonArrayField([]),
            created_at: wfTimestamp,
        },
        {
            id: 'wff-7',
            name: 'Company Logo',
            field_type: 'image',
            sort_order: 7,
            is_required: 0,
            options: jsonArrayField([]),
            created_at: wfTimestamp,
        },
        {
            id: 'wff-8',
            name: 'Supporting Documents',
            field_type: 'file',
            sort_order: 8,
            is_required: 0,
            options: jsonArrayField([]),
            created_at: wfTimestamp,
        },
        {
            id: 'wff-9',
            name: 'Reviewer Notes',
            field_type: 'textarea',
            sort_order: 1,
            is_required: 1,
            options: jsonArrayField([]),
            created_at: wfTimestamp,
        },
        {
            id: 'wff-10',
            name: 'Decision',
            field_type: 'select',
            sort_order: 2,
            is_required: 1,
            options: jsonArrayField([
                'Approve',
                'Needs Revision',
            ]),
            created_at: wfTimestamp,
        },
        {
            id: 'wff-11',
            name: 'Risk Assessment',
            field_type: 'radio',
            sort_order: 3,
            is_required: 0,
            options: jsonArrayField([
                'Low',
                'Medium',
                'High',
            ]),
            created_at: wfTimestamp,
        },
    ];

    const mockProjectFlows:
        ProjectFlowEntity[] = [
        {
            id: 'pw-1',
            project_id: '1',
            flow_id: 'wf-1',
            created_at: wfTimestamp,
        },
    ];

    const mockWfFlowNodes:
        WfFlowNodeEntity[] = [
        {
            id: 'wwn-1',
            flow_id: 'wf-1',
            node_id: 'wn-1',
            created_at: wfTimestamp,
        },
        {
            id: 'wwn-2',
            flow_id: 'wf-1',
            node_id: 'wn-2',
            created_at: wfTimestamp,
        },
        {
            id: 'wwn-3',
            flow_id: 'wf-1',
            node_id: 'wn-3',
            created_at: wfTimestamp,
        },
        {
            id: 'wwn-4',
            flow_id: 'wf-1',
            node_id: 'wn-4',
            created_at: wfTimestamp,
        },
    ];

    const mockWfNodeEdges:
        WfNodeEdgeEntity[] = [
        {
            id: 'wne-1',
            wf_edge_id: 'we-1',
            from_node_id: 'wn-1',
            to_node_id: 'wn-2',
            created_at: wfTimestamp,
        },
        {
            id: 'wne-2',
            wf_edge_id: 'we-2',
            from_node_id: 'wn-2',
            to_node_id: 'wn-3',
            created_at: wfTimestamp,
        },
        {
            id: 'wne-3',
            wf_edge_id: 'we-3',
            from_node_id: 'wn-3',
            to_node_id: 'wn-2',
            created_at: wfTimestamp,
        },
        {
            id: 'wne-4',
            wf_edge_id: 'we-4',
            from_node_id: 'wn-3',
            to_node_id: 'wn-4',
            created_at: wfTimestamp,
        },
    ];

    const mockWfNodeFields:
        WfNodeFieldEntity[] = [
        {
            id: 'wnf-1',
            node_id: 'wn-2',
            field_id: 'wff-1',
            created_at: wfTimestamp,
        },
        {
            id: 'wnf-2',
            node_id: 'wn-2',
            field_id: 'wff-2',
            created_at: wfTimestamp,
        },
        {
            id: 'wnf-3',
            node_id: 'wn-2',
            field_id: 'wff-3',
            created_at: wfTimestamp,
        },
        {
            id: 'wnf-4',
            node_id: 'wn-2',
            field_id: 'wff-4',
            created_at: wfTimestamp,
        },
        {
            id: 'wnf-5',
            node_id: 'wn-2',
            field_id: 'wff-5',
            created_at: wfTimestamp,
        },
        {
            id: 'wnf-6',
            node_id: 'wn-2',
            field_id: 'wff-6',
            created_at: wfTimestamp,
        },
        {
            id: 'wnf-7',
            node_id: 'wn-2',
            field_id: 'wff-7',
            created_at: wfTimestamp,
        },
        {
            id: 'wnf-8',
            node_id: 'wn-2',
            field_id: 'wff-8',
            created_at: wfTimestamp,
        },
        {
            id: 'wnf-9',
            node_id: 'wn-3',
            field_id: 'wff-9',
            created_at: wfTimestamp,
        },
        {
            id: 'wnf-10',
            node_id: 'wn-3',
            field_id: 'wff-10',
            created_at: wfTimestamp,
        },
        {
            id: 'wnf-11',
            node_id: 'wn-3',
            field_id: 'wff-11',
            created_at: wfTimestamp,
        },
    ];

    await Promise.all([
        ...projects.map(project =>
            adapter.projects.put(
                project.id,
                project,
            ),
        ),
        ...activities.map(activity =>
            adapter.activities.put(
                activity.id,
                activity,
            ),
        ),
        ...mockFlows.map(wf =>
            adapter.flows.put(
                wf.id, wf,
            ),
        ),
        ...mockWfNodes.map(n =>
            adapter.wfNodes.put(
                n.id, n,
            ),
        ),
        ...mockWfEdges.map(e =>
            adapter.wfEdges.put(
                e.id, e,
            ),
        ),
        ...mockWfFields.map(f =>
            adapter.wfFields.put(
                f.id, f,
            ),
        ),
    ]);

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
                    created_at: dt(75),
                }),
        ),
        ...teamMemberships.map(tm =>
            adapter.teamMembershipUsers
                .put(`tmu-${tm.id}`, {
                    id: `tmu-${tm.id}`,
                    team_membership_id:
                        tm.id,
                    user_id: tm.user_id,
                    created_at: dt(75),
                }),
        ),
    ]);

    const ideaSubmissions:
        IdeaSubmissionEntity[] = [
        {
            id: 'is-1',
            idea_id: '1',
            user_id: '1',
            created_at: dt(75, 9, 30),
        },
        {
            id: 'is-2',
            idea_id: '2',
            user_id: '2',
            created_at: dt(70),
        },
        {
            id: 'is-3',
            idea_id: '3',
            user_id: '5',
            created_at: dt(65),
        },
        {
            id: 'is-4',
            idea_id: '4',
            user_id: '8',
            created_at: dt(55),
        },
        {
            id: 'is-5',
            idea_id: '5',
            user_id: '9',
            created_at: dt(50),
        },
        {
            id: 'is-6',
            idea_id: '6',
            user_id: '3',
            created_at: dt(45),
        },
        {
            id: 'is-7',
            idea_id: '7',
            user_id: '1',
            created_at: dt(75, 10),
        },
        {
            id: 'is-8',
            idea_id: '8',
            user_id: '7',
            created_at: dt(35),
        },
        {
            id: 'is-9',
            idea_id: '9',
            user_id: '5',
            created_at: dt(30),
        },
        {
            id: 'is-10',
            idea_id: '10',
            user_id: '8',
            created_at: dt(25),
        },
        {
            id: 'is-11',
            idea_id: '11',
            user_id: '9',
            created_at: dt(20),
        },
    ];

    const activityActors:
        ActivityActorEntity[] = [
        {
            id: 'aa-1',
            activity_id: '1',
            user_id: '1',
            created_at: dt(0, 17, 50),
        },
        {
            id: 'aa-2',
            activity_id: '2',
            user_id: '7',
            created_at: dt(0, 17, 35),
        },
        {
            id: 'aa-3',
            activity_id: '3',
            user_id: '5',
            created_at: dt(0, 17),
        },
        {
            id: 'aa-4',
            activity_id: '4',
            user_id: '4',
            created_at: dt(0, 16),
        },
        {
            id: 'aa-5',
            activity_id: '5',
            user_id: '6',
            created_at: dt(0, 15),
        },
        {
            id: 'aa-6',
            activity_id: '6',
            user_id: '9',
            created_at: dt(0, 14),
        },
        {
            id: 'aa-7',
            activity_id: '7',
            user_id: '10',
            created_at: dt(0, 13),
        },
        {
            id: 'aa-8',
            activity_id: '8',
            user_id: '1',
            created_at: dt(0, 12),
        },
        {
            id: 'aa-9',
            activity_id: '9',
            user_id: '5',
            created_at: dt(1, 18),
        },
        {
            id: 'aa-10',
            activity_id: '10',
            user_id: '7',
            created_at: dt(1, 15),
        },
    ];

    await Promise.all([
        ...ideaSubmissions.map(r =>
            adapter.ideaSubmissions.put(
                r.id, r,
            ),
        ),
        ...activityActors.map(r =>
            adapter.activityActors.put(
                r.id, r,
            ),
        ),
        ...mockProjectFlows.map(r =>
            adapter.projectFlows.put(
                r.id, r,
            ),
        ),
        ...mockWfFlowNodes.map(r =>
            adapter.wfFlowNodes.put(
                r.id, r,
            ),
        ),
        ...mockWfNodeEdges.map(r =>
            adapter.wfNodeEdges.put(
                r.id, r,
            ),
        ),
        ...mockWfNodeFields.map(r =>
            adapter.wfNodeFields.put(
                r.id, r,
            ),
        ),
    ]);
}

export async function populateBootstrapData(
    adapter: DbAdapter,
): Promise<void> {
    await Promise.all([
        adapter.users.put('current', {
            first_name: 'Tony',
            last_name: 'Stark',
            email: 'demo@example.com',
            role: 'Admin',
            department: 'Product',
            status: 'active' as UserStatus,
            availability: 100,
            performance_score: 95,
            projects_completed: 20,
            current_projects: 5,
            strengths: jsonArrayField([
                'Strategic Planning',
                'Data Analysis',
                'Stakeholder Management',
            ]),
            team_dimensions: jsonObjectField({
                driver: 80,
                analytical: 80,
                expressive: 80,
                amiable: 80,
            }),
            phone: '+1 (555) 123-4567',
            bio: 'Passionate about building'
                + ' products that solve'
                + ' real problems.',
            last_active: dt(0, 18),
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
            next_billing: dt(-300, 0),
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
            last_activity: dt(0, 16),
            active_users: 14,
        }),
    ]);
}
