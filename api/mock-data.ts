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
            id: 'a0facefa-e853-4d92-b796-373da78aba93',
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
            id: '846cf47c-26b9-4b65-8a45-6584380a7307',
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
            id: '36b9389e-c788-4c83-aca3-78d6086b6612',
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
            id: 'a2d59bdf-71bd-40bf-b891-d0d4ddb190f7',
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
            id: 'b088941a-bf05-409d-b910-37ea7031f382',
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
            id: '713d7886-41f0-48c6-978e-f90a2eb4082a',
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
            id: '8f84d90c-ca19-4a95-ae71-e7af7fd23cdf',
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
            id: 'b862fb83-77e8-438e-a562-a9a56c8c6d92',
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
            id: '670a5e43-dab1-4f54-958f-be483d568dd1',
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
            id: '8a4e81f6-58dc-4f06-b850-dd5bc1c66f10',
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
            id: 'd752cb3e-8e59-423f-95ba-d35a0f16f883',
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
            id: 'e9a7b7c9-f449-46b6-92b1-7144d29f6612',
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
            id: 'eef228e7-8ab1-42ed-afae-d095c214a85b',
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
            id: 'f0582dd9-4f65-45bc-a23d-47ca7426582c',
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
            id: 'b112a99b-4993-4ea3-8621-0ba9c6036896',
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
            id: '48fe64d4-89f8-483b-b819-53045ecb9e5f',
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
            id: '7cdd88db-2463-41cc-9303-89dd3254ad40',
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
            id: 'b46bd91c-1b7d-409b-8f1c-28e1c6996241',
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
            id: '80450d9e-d3c5-4eaa-bd70-2bd4048edcc7',
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
            id: 'cd1bb80d-cb50-48c4-aa21-3a115fbbd114',
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
            id: '9add8b29-d51e-49f9-b4e0-e17d23370732',
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
            id: 'd04b29ad-cc85-4830-adc2-96b1e434d1d0',
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
            id: '8b75e9ca-76ed-42c0-b496-699eb5a2e400',
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
            id: '2769a925-a940-4103-bbb3-30621b28d351',
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
            id: 'df38053d-2a9c-488e-9619-493099b522d0',
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
            id: '9d1911ec-5a65-4f16-9233-54549d46e89d',
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
            id: '6c7370d2-ba84-42d8-a00c-8a474760f1c1',
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
            id: 'edc2a974-ea45-4988-902b-34e99a881d58',
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
            id: '94c4e07d-80e9-465f-86af-bd2e7e3cc200',
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
            id: 'dfa054fe-4619-4c9e-9fa6-2d053192c145',
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
            id: 'f2553dc5-b375-4cd4-8959-bbbd30b64fc4',
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
            id: '54883b41-11ca-4d7a-926a-bbca8523357d',
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
            id: '561cbb6e-a8f1-4b52-8365-5559bc32c017',
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
            id: 'b07adeaa-7484-49be-a9d7-5652555c9f7f',
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
            id: '7c6c4356-a06b-4f43-99ac-9a481baf70f1',
            name: 'New',
            description: '',
            position_x: 40,
            position_y: 30,
            is_start: 1,
            is_complete: 0,
            created_at: wfTimestamp,
        },
        {
            id: 'bfe39522-9b30-4db4-a8af-8b9acc02a8fe',
            name: 'Data Capture',
            description: '',
            position_x: 260,
            position_y: 140,
            is_start: 0,
            is_complete: 0,
            created_at: wfTimestamp,
        },
        {
            id: '357443aa-2aa4-4c1b-8293-2f55a49a83e6',
            name: 'Review',
            description: '',
            position_x: 480,
            position_y: 250,
            is_start: 0,
            is_complete: 0,
            created_at: wfTimestamp,
        },
        {
            id: 'cfdd1f8c-8415-4610-8c6f-7504eb54ef4f',
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
            id: 'e7e43fb7-344c-4fde-9bff-53ecb411fd6a',
            name: 'begin',
            description: '',
            created_at: wfTimestamp,
        },
        {
            id: '00a85417-914c-4ab8-b558-4f31a0d3a72c',
            name: 'submit',
            description: '',
            created_at: wfTimestamp,
        },
        {
            id: 'cabe0849-aea8-4288-b8a9-f1b1cfd0cd7e',
            name: 'needs revision',
            description: '',
            created_at: wfTimestamp,
        },
        {
            id: '58aa5414-b787-401e-80ec-0494c00af9ff',
            name: 'approve',
            description: '',
            created_at: wfTimestamp,
        },
    ];

    const mockWfFields:
        WfFieldEntity[] = [
        {
            id: '9ee5e0cb-6485-452d-8738-a8ca92ea62dc',
            name: 'Company Name',
            field_type: 'text',
            sort_order: 1,
            is_required: 1,
            options: jsonArrayField([]),
            created_at: wfTimestamp,
        },
        {
            id: '1076b0ff-3502-4cbe-b41b-bd64b2a2cc49',
            name: 'Contact Email',
            field_type: 'email',
            sort_order: 2,
            is_required: 1,
            options: jsonArrayField([]),
            created_at: wfTimestamp,
        },
        {
            id: 'd597e67f-e37b-4189-aa50-c6e8cc4fd9be',
            name: 'Contact Phone',
            field_type: 'phone',
            sort_order: 3,
            is_required: 0,
            options: jsonArrayField([]),
            created_at: wfTimestamp,
        },
        {
            id: '361a0441-a634-4ff9-b4d1-b9528950bf41',
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
            id: '581fc85d-6954-42fd-910c-1674970f174f',
            name: 'Annual Revenue',
            field_type: 'currency',
            sort_order: 5,
            is_required: 0,
            options: jsonArrayField([]),
            created_at: wfTimestamp,
        },
        {
            id: '76792667-d2ff-48ab-b078-01d5d1bf187c',
            name: 'Number of Employees',
            field_type: 'number',
            sort_order: 6,
            is_required: 0,
            options: jsonArrayField([]),
            created_at: wfTimestamp,
        },
        {
            id: 'c03de6e0-224b-4dd1-9490-b6004d6d9684',
            name: 'Company Logo',
            field_type: 'image',
            sort_order: 7,
            is_required: 0,
            options: jsonArrayField([]),
            created_at: wfTimestamp,
        },
        {
            id: '82af66a7-6373-400d-ba57-5e0e66df9365',
            name: 'Supporting Documents',
            field_type: 'file',
            sort_order: 8,
            is_required: 0,
            options: jsonArrayField([]),
            created_at: wfTimestamp,
        },
        {
            id: '542af865-0bd3-4653-8de6-308ae793c996',
            name: 'Reviewer Notes',
            field_type: 'textarea',
            sort_order: 1,
            is_required: 1,
            options: jsonArrayField([]),
            created_at: wfTimestamp,
        },
        {
            id: '191493d3-fd82-4f77-87a7-deb15eb569c2',
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
            id: '4506eca9-8ba6-4312-8b4a-e06c9f275066',
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
            id: 'b89df96a-0863-4e0a-8574-31af5d259efc',
            project_id: 'd04b29ad-cc85-4830-adc2-96b1e434d1d0',
            flow_id: 'b07adeaa-7484-49be-a9d7-5652555c9f7f',
            created_at: wfTimestamp,
        },
    ];

    const mockWfFlowNodes:
        WfFlowNodeEntity[] = [
        {
            id: '570e7d38-3541-4e22-827c-cab5ee0e4b54',
            flow_id: 'b07adeaa-7484-49be-a9d7-5652555c9f7f',
            node_id: '7c6c4356-a06b-4f43-99ac-9a481baf70f1',
            created_at: wfTimestamp,
        },
        {
            id: 'a7628908-cdde-4398-bec2-4053dad39101',
            flow_id: 'b07adeaa-7484-49be-a9d7-5652555c9f7f',
            node_id: 'bfe39522-9b30-4db4-a8af-8b9acc02a8fe',
            created_at: wfTimestamp,
        },
        {
            id: '2eaee732-56ff-4757-9cd2-dc96cb99eadd',
            flow_id: 'b07adeaa-7484-49be-a9d7-5652555c9f7f',
            node_id: '357443aa-2aa4-4c1b-8293-2f55a49a83e6',
            created_at: wfTimestamp,
        },
        {
            id: 'edd2b6ce-4d32-4c52-9686-a38e27b9ac9a',
            flow_id: 'b07adeaa-7484-49be-a9d7-5652555c9f7f',
            node_id: 'cfdd1f8c-8415-4610-8c6f-7504eb54ef4f',
            created_at: wfTimestamp,
        },
    ];

    const mockWfNodeEdges:
        WfNodeEdgeEntity[] = [
        {
            id: '980790a7-b80f-4265-85f8-fd46cddfef67',
            wf_edge_id: 'e7e43fb7-344c-4fde-9bff-53ecb411fd6a',
            from_node_id: '7c6c4356-a06b-4f43-99ac-9a481baf70f1',
            to_node_id: 'bfe39522-9b30-4db4-a8af-8b9acc02a8fe',
            created_at: wfTimestamp,
        },
        {
            id: 'dea18858-94be-4e9d-b102-e74ee28707fa',
            wf_edge_id: '00a85417-914c-4ab8-b558-4f31a0d3a72c',
            from_node_id: 'bfe39522-9b30-4db4-a8af-8b9acc02a8fe',
            to_node_id: '357443aa-2aa4-4c1b-8293-2f55a49a83e6',
            created_at: wfTimestamp,
        },
        {
            id: 'd34e72f8-8574-43d2-80d9-765155b97697',
            wf_edge_id: 'cabe0849-aea8-4288-b8a9-f1b1cfd0cd7e',
            from_node_id: '357443aa-2aa4-4c1b-8293-2f55a49a83e6',
            to_node_id: 'bfe39522-9b30-4db4-a8af-8b9acc02a8fe',
            created_at: wfTimestamp,
        },
        {
            id: 'fb70cebb-4bbd-4454-aa19-7c8f00d7de72',
            wf_edge_id: '58aa5414-b787-401e-80ec-0494c00af9ff',
            from_node_id: '357443aa-2aa4-4c1b-8293-2f55a49a83e6',
            to_node_id: 'cfdd1f8c-8415-4610-8c6f-7504eb54ef4f',
            created_at: wfTimestamp,
        },
    ];

    const mockWfNodeFields:
        WfNodeFieldEntity[] = [
        {
            id: 'c3eff5dd-d73b-4170-bf84-6a85577e96fb',
            node_id: 'bfe39522-9b30-4db4-a8af-8b9acc02a8fe',
            field_id: '9ee5e0cb-6485-452d-8738-a8ca92ea62dc',
            created_at: wfTimestamp,
        },
        {
            id: '91a1ea83-4117-44cf-8648-2e639669a11a',
            node_id: 'bfe39522-9b30-4db4-a8af-8b9acc02a8fe',
            field_id: '1076b0ff-3502-4cbe-b41b-bd64b2a2cc49',
            created_at: wfTimestamp,
        },
        {
            id: '109a3a8b-569a-4475-97ba-e4995deb19cf',
            node_id: 'bfe39522-9b30-4db4-a8af-8b9acc02a8fe',
            field_id: 'd597e67f-e37b-4189-aa50-c6e8cc4fd9be',
            created_at: wfTimestamp,
        },
        {
            id: 'f6f26dac-3139-44e3-b45a-01969a8c85bf',
            node_id: 'bfe39522-9b30-4db4-a8af-8b9acc02a8fe',
            field_id: '361a0441-a634-4ff9-b4d1-b9528950bf41',
            created_at: wfTimestamp,
        },
        {
            id: '7f19901c-a1db-4780-983b-3a29826faf5c',
            node_id: 'bfe39522-9b30-4db4-a8af-8b9acc02a8fe',
            field_id: '581fc85d-6954-42fd-910c-1674970f174f',
            created_at: wfTimestamp,
        },
        {
            id: 'de723a0d-294e-49a8-a362-9633c5e9938f',
            node_id: 'bfe39522-9b30-4db4-a8af-8b9acc02a8fe',
            field_id: '76792667-d2ff-48ab-b078-01d5d1bf187c',
            created_at: wfTimestamp,
        },
        {
            id: 'd576e93c-9add-4e67-903b-6bb1482ff2d7',
            node_id: 'bfe39522-9b30-4db4-a8af-8b9acc02a8fe',
            field_id: 'c03de6e0-224b-4dd1-9490-b6004d6d9684',
            created_at: wfTimestamp,
        },
        {
            id: '27043277-7f34-456d-9d37-67c83e933a7d',
            node_id: 'bfe39522-9b30-4db4-a8af-8b9acc02a8fe',
            field_id: '82af66a7-6373-400d-ba57-5e0e66df9365',
            created_at: wfTimestamp,
        },
        {
            id: 'cf2b1560-7019-48fc-8c1f-608768724c47',
            node_id: '357443aa-2aa4-4c1b-8293-2f55a49a83e6',
            field_id: '542af865-0bd3-4653-8de6-308ae793c996',
            created_at: wfTimestamp,
        },
        {
            id: 'faee1b38-a9a5-464f-a71e-5836ed32a416',
            node_id: '357443aa-2aa4-4c1b-8293-2f55a49a83e6',
            field_id: '191493d3-fd82-4f77-87a7-deb15eb569c2',
            created_at: wfTimestamp,
        },
        {
            id: '9e9a5c22-7e7a-4a6f-a339-f78dc572b553',
            node_id: '357443aa-2aa4-4c1b-8293-2f55a49a83e6',
            field_id: '4506eca9-8ba6-4312-8b4a-e06c9f275066',
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
            id: '0258cc46-3492-4de6-985f-99d7e48075d7',
            project_id: 'd04b29ad-cc85-4830-adc2-96b1e434d1d0',
            user_id: 'a0facefa-e853-4d92-b796-373da78aba93',
            role: 'lead',
            type: 'business',
        },
        {
            id: '1bd9b840-0a40-4530-bfd2-a4120a58f0ac',
            project_id: 'd04b29ad-cc85-4830-adc2-96b1e434d1d0',
            user_id: '846cf47c-26b9-4b65-8a45-6584380a7307',
            role: 'ML Engineer',
            type: 'engineering',
        },
        {
            id: '56c28ecb-b705-4cac-8de6-b20dbaa9ccc1',
            project_id: 'd04b29ad-cc85-4830-adc2-96b1e434d1d0',
            user_id: '36b9389e-c788-4c83-aca3-78d6086b6612',
            role: 'Data Scientist',
            type: 'engineering',
        },
        {
            id: 'be891910-772c-4f77-ba9e-683be50a8a30',
            project_id: 'd04b29ad-cc85-4830-adc2-96b1e434d1d0',
            user_id: 'a2d59bdf-71bd-40bf-b891-d0d4ddb190f7',
            role: 'Backend Developer',
            type: 'engineering',
        },
        {
            id: '1b443418-d376-4dfb-945c-e5639ed8252b',
            project_id: '8b75e9ca-76ed-42c0-b496-699eb5a2e400',
            user_id: '846cf47c-26b9-4b65-8a45-6584380a7307',
            role: 'lead',
            type: 'business',
        },
        {
            id: 'b648bfa3-6573-4c5a-8aa8-cb57e11dce48',
            project_id: '2769a925-a940-4103-bbb3-30621b28d351',
            user_id: 'b088941a-bf05-409d-b910-37ea7031f382',
            role: 'lead',
            type: 'business',
        },
        {
            id: '9058be89-1993-4e2a-8289-4e3842dad081',
            project_id: 'df38053d-2a9c-488e-9619-493099b522d0',
            user_id: 'b862fb83-77e8-438e-a562-a9a56c8c6d92',
            role: 'lead',
            type: 'business',
        },
        {
            id: '0baba16a-9ec6-4d27-ab04-e5f45eb4b6a2',
            project_id: '9d1911ec-5a65-4f16-9233-54549d46e89d',
            user_id: '670a5e43-dab1-4f54-958f-be483d568dd1',
            role: 'lead',
            type: 'business',
        },
        {
            id: '95de53f0-76f6-4626-abd7-0e5253794b39',
            project_id: '6c7370d2-ba84-42d8-a00c-8a474760f1c1',
            user_id: '36b9389e-c788-4c83-aca3-78d6086b6612',
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
            id: '0e9f4cdf-b80c-40de-8900-b3f1bcf1c7bb',
            idea_id: 'd752cb3e-8e59-423f-95ba-d35a0f16f883',
            user_id: 'a0facefa-e853-4d92-b796-373da78aba93',
            created_at: dt(75, 9, 30),
        },
        {
            id: '8d875ac4-94c8-4790-a6d9-94276acc6322',
            idea_id: 'e9a7b7c9-f449-46b6-92b1-7144d29f6612',
            user_id: '846cf47c-26b9-4b65-8a45-6584380a7307',
            created_at: dt(70),
        },
        {
            id: '7c786515-ba8e-4a08-850c-20a4625719ff',
            idea_id: 'eef228e7-8ab1-42ed-afae-d095c214a85b',
            user_id: 'b088941a-bf05-409d-b910-37ea7031f382',
            created_at: dt(65),
        },
        {
            id: 'd972a716-aebd-4f80-bf0c-8e1070c7411e',
            idea_id: 'f0582dd9-4f65-45bc-a23d-47ca7426582c',
            user_id: 'b862fb83-77e8-438e-a562-a9a56c8c6d92',
            created_at: dt(55),
        },
        {
            id: 'd4844b65-f935-4e5d-8e74-ff2e6e8ec027',
            idea_id: 'b112a99b-4993-4ea3-8621-0ba9c6036896',
            user_id: '670a5e43-dab1-4f54-958f-be483d568dd1',
            created_at: dt(50),
        },
        {
            id: '572210aa-a086-4e11-bd4c-1c2b4900c2a5',
            idea_id: '48fe64d4-89f8-483b-b819-53045ecb9e5f',
            user_id: '36b9389e-c788-4c83-aca3-78d6086b6612',
            created_at: dt(45),
        },
        {
            id: 'b9ad0066-acbf-47ce-90de-8b1fe4d0f196',
            idea_id: '7cdd88db-2463-41cc-9303-89dd3254ad40',
            user_id: 'a0facefa-e853-4d92-b796-373da78aba93',
            created_at: dt(75, 10),
        },
        {
            id: '94a8b845-273f-400f-b9c3-8dd4c834bc90',
            idea_id: 'b46bd91c-1b7d-409b-8f1c-28e1c6996241',
            user_id: '8f84d90c-ca19-4a95-ae71-e7af7fd23cdf',
            created_at: dt(35),
        },
        {
            id: '79cfa715-4c0c-4c0f-b44a-0d056bcf9c52',
            idea_id: '80450d9e-d3c5-4eaa-bd70-2bd4048edcc7',
            user_id: 'b088941a-bf05-409d-b910-37ea7031f382',
            created_at: dt(30),
        },
        {
            id: 'd7fc26bc-2f52-4a25-9b2c-9b8640f3f99e',
            idea_id: 'cd1bb80d-cb50-48c4-aa21-3a115fbbd114',
            user_id: 'b862fb83-77e8-438e-a562-a9a56c8c6d92',
            created_at: dt(25),
        },
        {
            id: '5c6380e6-f3ce-4f24-a199-4083dec49ec9',
            idea_id: '9add8b29-d51e-49f9-b4e0-e17d23370732',
            user_id: '670a5e43-dab1-4f54-958f-be483d568dd1',
            created_at: dt(20),
        },
    ];

    const activityActors:
        ActivityActorEntity[] = [
        {
            id: '93fbdeb7-5956-4d67-970f-f83bc550d638',
            activity_id: '0d34ec17-67bd-4fc8-89a1-674bed8612a3',
            user_id: 'a0facefa-e853-4d92-b796-373da78aba93',
            created_at: dt(0, 17, 50),
        },
        {
            id: '78d400a3-f07e-46cd-822a-6cf161913f96',
            activity_id: '44a5f0e1-458a-4813-aaaf-00cdc9be8a13',
            user_id: '8f84d90c-ca19-4a95-ae71-e7af7fd23cdf',
            created_at: dt(0, 17, 35),
        },
        {
            id: '38c0651f-eea9-4ee4-8e73-587cb6fc6ec0',
            activity_id: 'edc2a974-ea45-4988-902b-34e99a881d58',
            user_id: 'b088941a-bf05-409d-b910-37ea7031f382',
            created_at: dt(0, 17),
        },
        {
            id: '80331324-cd07-412a-b844-084f10b7242b',
            activity_id: '94c4e07d-80e9-465f-86af-bd2e7e3cc200',
            user_id: 'a2d59bdf-71bd-40bf-b891-d0d4ddb190f7',
            created_at: dt(0, 16),
        },
        {
            id: '44db67b1-4012-4009-b1e2-79216a5df29f',
            activity_id: 'dfa054fe-4619-4c9e-9fa6-2d053192c145',
            user_id: '713d7886-41f0-48c6-978e-f90a2eb4082a',
            created_at: dt(0, 15),
        },
        {
            id: 'a741d74e-5db4-46ad-b810-365c5625feaf',
            activity_id: 'f2553dc5-b375-4cd4-8959-bbbd30b64fc4',
            user_id: '670a5e43-dab1-4f54-958f-be483d568dd1',
            created_at: dt(0, 14),
        },
        {
            id: '7b2b0937-f284-4881-90ff-194b168a9d80',
            activity_id: '54883b41-11ca-4d7a-926a-bbca8523357d',
            user_id: '8a4e81f6-58dc-4f06-b850-dd5bc1c66f10',
            created_at: dt(0, 13),
        },
        {
            id: '4172c884-230e-4d7f-92a2-84cdc220c198',
            activity_id: '561cbb6e-a8f1-4b52-8365-5559bc32c017',
            user_id: 'a0facefa-e853-4d92-b796-373da78aba93',
            created_at: dt(0, 12),
        },
        {
            id: '983b7750-6a7e-45a3-a5d4-d78db67e59f5',
            activity_id: 'e67fade5-95b3-42d8-b927-9be199c98ed0',
            user_id: 'b088941a-bf05-409d-b910-37ea7031f382',
            created_at: dt(1, 18),
        },
        {
            id: 'b7d2f6d4-18e4-4eb8-a7f4-dcebb7243950',
            activity_id: 'c55e8c4e-17b6-4c0b-838a-9fbabceefec1',
            user_id: '8f84d90c-ca19-4a95-ae71-e7af7fd23cdf',
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
