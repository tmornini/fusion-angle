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
    ProjectFlowEntity,
    WorkOrderEntity,
    FlowWorkOrderEntity,
    WorkOrderTransitionEntity,
} from './types';
import {
    jsonArrayField,
    jsonObjectField,
    DEFAULT_LOCK_TIMEOUT,
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
            position: 1,
            status: 'in-review',

            problem_statement:
                'Marketing team spends 20+'
                + ' hours weekly manually'
                + ' segmenting customers,'
                + ' leading to delayed'
                + ' campaigns and missed'
                + ' opportunities.',
            target_users:
                'Marketing team,'
                + ' campaign managers,'
                + ' data analysts',
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
            success_metrics:
                '80% reduction in manual'
                + ' segmentation time, 25%'
                + ' increase in campaign'
                + ' conversion rates',
            readiness: 'ready',

            risks: jsonArrayField([]),
            assumptions: jsonArrayField([]),
            alignments: jsonArrayField([]),
        },
        {
            id: 'e9a7b7c9-f449-46b6-92b1-7144d29f6612',
            title: 'Automated Report'
                + ' Generation',
            position: 2,
            status: 'approved',

            problem_statement:
                'Analysts spend 15+ hours'
                + ' per week manually'
                + ' compiling reports from'
                + ' multiple data sources,'
                + ' causing delays in'
                + ' decision-making.',
            target_users:
                'Business analysts,'
                + ' finance team,'
                + ' department heads',
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
            success_metrics:
                '90% reduction in report'
                + ' preparation time,'
                + ' 100% on-time delivery',
            readiness: 'ready',

            risks: jsonArrayField([]),
            assumptions: jsonArrayField([]),
            alignments: jsonArrayField([]),
        },
        {
            id: 'eef228e7-8ab1-42ed-afae-d095c214a85b',
            title: 'Predictive Maintenance'
                + ' System',
            position: 3,
            status: 'active',

            problem_statement:
                'Unplanned equipment'
                + ' downtime costs $50K per'
                + ' incident and occurs 3-4'
                + ' times per quarter due to'
                + ' reactive maintenance.',
            target_users:
                'Operations team,'
                + ' maintenance crew,'
                + ' plant managers',
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
            success_metrics: '',
            readiness: 'needs-info',

            risks: jsonArrayField([]),
            assumptions: jsonArrayField([]),
            alignments: jsonArrayField([]),
        },
        {
            id: 'f0582dd9-4f65-45bc-a23d-47ca7426582c',
            title: 'Real-time Analytics'
                + ' Dashboard',
            position: 4,
            status: 'in-review',

            problem_statement:
                'Leadership relies on'
                + ' weekly batch reports'
                + ' that are outdated by the'
                + ' time they arrive,'
                + ' missing real-time'
                + ' trends.',
            target_users:
                'Executive team,'
                + ' VP of operations,'
                + ' product managers',
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
            success_metrics:
                'Dashboard response time'
                + ' under 2 seconds, 95%'
                + ' daily active usage'
                + ' by leadership',
            readiness: 'ready',

            risks: jsonArrayField([]),
            assumptions: jsonArrayField([]),
            alignments: jsonArrayField([]),
        },
        {
            id: 'b112a99b-4993-4ea3-8621-0ba9c6036896',
            title: 'Smart Inventory'
                + ' Optimization',
            position: 5,
            status: 'active',

            problem_statement:
                'Excess inventory ties up'
                + ' $2M in capital while'
                + ' stockouts cause 8% of'
                + ' orders to be delayed or'
                + ' cancelled.',
            target_users: '',
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
            success_metrics: '',
            readiness: 'needs-info',

            risks: jsonArrayField([]),
            assumptions: jsonArrayField([]),
            alignments: jsonArrayField([]),
        },
        {
            id: '48fe64d4-89f8-483b-b819-53045ecb9e5f',
            title: 'Employee Training'
                + ' Assistant',
            position: 6,
            status: 'sent-back',

            problem_statement:
                'New hire onboarding takes'
                + ' 6 weeks on average, with'
                + ' inconsistent training'
                + ' quality across'
                + ' departments.',
            target_users:
                'New hires, HR team,'
                + ' department trainers',
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
            success_metrics:
                '50% faster onboarding,'
                + ' 40% higher new-hire'
                + ' productivity scores',
            readiness: 'incomplete',

            risks: jsonArrayField([]),
            assumptions: jsonArrayField([]),
            alignments: jsonArrayField([]),
        },
        {
            id: '7cdd88db-2463-41cc-9303-89dd3254ad40',
            title: 'AI-Powered Customer'
                + ' Support Chatbot',
            position: 8,
            status: 'in-review',

            problem_statement:
                'Support team handles'
                + ' 500+ tier-1 tickets'
                + ' daily, with average'
                + ' response time of 4'
                + ' hours.',
            target_users:
                'Customer support team,'
                + ' customers, support'
                + ' operations manager',
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
            success_metrics:
                '60% ticket deflection'
                + ' rate, CSAT above 4.5,'
                + ' average response time'
                + ' under 30 seconds',
            readiness: 'ready',

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
        },
        {
            id: 'b46bd91c-1b7d-409b-8f1c-28e1c6996241',
            title: 'Mobile App Push'
                + ' Notification Revamp',
            position: 10,
            status: 'in-review',

            problem_statement:
                'Push notification opt-out'
                + ' rate is 42% due to'
                + ' irrelevant, poorly'
                + ' timed messages.',
            target_users:
                'Mobile app users,'
                + ' product team,'
                + ' marketing',
            proposed_solution:
                'Implement user-preference'
                + ' controls and ML-based'
                + ' send-time optimization.',
            expected_outcome:
                'Reduce opt-out rate to'
                + ' under 20% and increase'
                + ' notification engagement'
                + ' by 35%.',
            success_metrics:
                'Opt-out rate below 20%,'
                + ' 35% higher engagement'
                + ' on push notifications',
            readiness: 'needs-info',

            risks: jsonArrayField([]),
            assumptions: jsonArrayField([]),
            alignments: jsonArrayField([]),
        },
        {
            id: '80450d9e-d3c5-4eaa-bd70-2bd4048edcc7',
            title: 'Sustainability Dashboard'
                + ' for Operations',
            position: 9,
            status: 'in-review',

            problem_statement:
                'No centralized view of'
                + ' energy, water, and'
                + ' waste metrics across'
                + ' facilities.',
            target_users: '',
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
            success_metrics:
                '15% energy cost'
                + ' reduction, ESG report'
                + ' delivery on schedule',
            readiness: 'ready',

            risks: jsonArrayField([]),
            assumptions: jsonArrayField([]),
            alignments: jsonArrayField([]),
        },
        {
            id: 'cd1bb80d-cb50-48c4-aa21-3a115fbbd114',
            title: 'Employee Wellness'
                + ' Program Integration',
            position: 11,
            status: 'in-review',

            problem_statement:
                'Employee burnout rates'
                + ' are rising with no'
                + ' unified wellness'
                + ' tracking or resources.',
            target_users:
                'All employees, HR team,'
                + ' people operations',
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
            success_metrics:
                '50% participation'
                + ' increase, 12% lower'
                + ' voluntary turnover',
            readiness: 'incomplete',

            risks: jsonArrayField([]),
            assumptions: jsonArrayField([]),
            alignments: jsonArrayField([]),
        },
        {
            id: '9add8b29-d51e-49f9-b4e0-e17d23370732',
            title: 'Real-time Inventory'
                + ' Tracking System',
            position: 7,
            status: 'in-review',

            problem_statement:
                'Inventory counts rely on'
                + ' manual audits that lag'
                + ' 48 hours behind actual'
                + ' stock movements.',
            target_users:
                'Warehouse staff,'
                + ' supply chain team,'
                + ' logistics managers',
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
            success_metrics:
                '99.5% inventory accuracy,'
                + ' zero manual'
                + ' reconciliation needed',
            readiness: 'ready',

            risks: jsonArrayField([]),
            assumptions: jsonArrayField([]),
            alignments: jsonArrayField([]),
        },
    ];

    await Promise.all([
        ...ideas.map(idea =>
            adapter.ideas.put(idea.id, idea),
        ),
        adapter.company.put({
            name: 'Stark Industries',
            domain: 'acmecorp.com',
        }),
        adapter.organization.put({
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
            position: 1,
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
            position: 2,
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
            position: 3,
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
            position: 4,
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
            position: 5,
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
            position: 6,
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
            id: 'b07adeaa-7484-49be-'
                + 'a9d7-5652555c9f7f',
            name: 'Customer Onboarding',
            description:
                'Standard customer'
                + ' onboarding process',
            is_locked: false,
            is_auto_layout: true,
            is_auto_fit: true,
            lock_timeout:
                DEFAULT_LOCK_TIMEOUT,
            graph: jsonObjectField({
                nodes: [
                    {
                        id: '7c6c4356-a06b'
                            + '-4f43-99ac'
                            + '-9a481baf70f1',
                        name: 'Start',
                        description: '',
                        positionX: 40,
                        positionY: 30,
                        isStart: true,
                        isComplete: false,
                        fields: [],
                    },
                    {
                        id: 'bfe39522-9b30'
                            + '-4db4-a8af'
                            + '-8b9acc02a8fe',
                        name:
                            'Data Capture',
                        description: '',
                        positionX: 260,
                        positionY: 140,
                        isStart: false,
                        isComplete: false,
                        fields: [
                            {
                                id: '9ee5e0cb'
                                    + '-6485'
                                    + '-452d'
                                    + '-8738'
                                    + '-a8ca92'
                                    + 'ea62dc',
                                name:
                                    'Company'
                                    + ' Name',
                                fieldType:
                                    'text',
                                sortOrder: 1,
                                isRequired:
                                    true,
                                options: [],
                            },
                            {
                                id: '1076b0ff'
                                    + '-3502'
                                    + '-4cbe'
                                    + '-b41b'
                                    + '-bd64b2'
                                    + 'a2cc49',
                                name:
                                    'Contact'
                                    + ' Email',
                                fieldType:
                                    'email',
                                sortOrder: 2,
                                isRequired:
                                    true,
                                options: [],
                            },
                            {
                                id: 'd597e67f'
                                    + '-e37b'
                                    + '-4189'
                                    + '-aa50'
                                    + '-c6e8cc'
                                    + '4fd9be',
                                name:
                                    'Contact'
                                    + ' Phone',
                                fieldType:
                                    'phone',
                                sortOrder: 3,
                                isRequired:
                                    false,
                                options: [],
                            },
                            {
                                id: '361a0441'
                                    + '-a634'
                                    + '-4ff9'
                                    + '-b4d1'
                                    + '-b9528950'
                                    + 'bf41',
                                name:
                                    'Industry',
                                fieldType:
                                    'select',
                                sortOrder: 4,
                                isRequired:
                                    false,
                                options: [
                                    'Technology',
                                    'Finance',
                                    'Healthcare',
                                    'Retail',
                                    'Manufacturing',
                                ],
                            },
                            {
                                id: '581fc85d'
                                    + '-6954'
                                    + '-42fd'
                                    + '-910c'
                                    + '-167497'
                                    + '0f174f',
                                name:
                                    'Annual'
                                    + ' Revenue',
                                fieldType:
                                    'currency',
                                sortOrder: 5,
                                isRequired:
                                    false,
                                options: [],
                            },
                            {
                                id: '76792667'
                                    + '-d2ff'
                                    + '-48ab'
                                    + '-b078'
                                    + '-01d5d1'
                                    + 'bf187c',
                                name:
                                    'Number of'
                                    + ' Employees',
                                fieldType:
                                    'number',
                                sortOrder: 6,
                                isRequired:
                                    false,
                                options: [],
                            },
                            {
                                id: 'c03de6e0'
                                    + '-224b'
                                    + '-4dd1'
                                    + '-9490'
                                    + '-b6004d'
                                    + '6d9684',
                                name:
                                    'Company'
                                    + ' Logo',
                                fieldType:
                                    'image',
                                sortOrder: 7,
                                isRequired:
                                    false,
                                options: [],
                            },
                            {
                                id: '82af66a7'
                                    + '-6373'
                                    + '-400d'
                                    + '-ba57'
                                    + '-5e0e66'
                                    + 'df9365',
                                name:
                                    'Supporting'
                                    + ' Documents',
                                fieldType:
                                    'file',
                                sortOrder: 8,
                                isRequired:
                                    false,
                                options: [],
                            },
                        ],
                    },
                    {
                        id: '357443aa-2aa4'
                            + '-4c1b-8293'
                            + '-2f55a49a83e6',
                        name: 'Review',
                        description: '',
                        positionX: 480,
                        positionY: 250,
                        isStart: false,
                        isComplete: false,
                        fields: [
                            {
                                id: '542af865'
                                    + '-0bd3'
                                    + '-4653'
                                    + '-8de6'
                                    + '-308ae7'
                                    + '93c996',
                                name:
                                    'Reviewer'
                                    + ' Notes',
                                fieldType:
                                    'textarea',
                                sortOrder: 1,
                                isRequired:
                                    true,
                                options: [],
                            },
                        ],
                    },
                    {
                        id: 'cfdd1f8c-8415'
                            + '-4610-8c6f'
                            + '-7504eb54ef4f',
                        name: 'End',
                        description: '',
                        positionX: 680,
                        positionY: 370,
                        isStart: false,
                        isComplete: true,
                        fields: [],
                    },
                ],
                edges: [
                    {
                        id: 'e7e43fb7-344c'
                            + '-4fde-9bff'
                            + '-53ecb411fd6a',
                        name: 'begin',
                        description: '',
                        fromNodeId:
                            '7c6c4356-a06b'
                            + '-4f43-99ac'
                            + '-9a481baf70f1',
                        toNodeId:
                            'bfe39522-9b30'
                            + '-4db4-a8af'
                            + '-8b9acc02a8fe',
                    },
                    {
                        id: '00a85417-914c'
                            + '-4ab8-b558'
                            + '-4f31a0d3a72c',
                        name: 'submit',
                        description: '',
                        fromNodeId:
                            'bfe39522-9b30'
                            + '-4db4-a8af'
                            + '-8b9acc02a8fe',
                        toNodeId:
                            '357443aa-2aa4'
                            + '-4c1b-8293'
                            + '-2f55a49a83e6',
                    },
                    {
                        id: 'cabe0849-aea8'
                            + '-4288-b8a9'
                            + '-f1b1cfd0cd7e',
                        name:
                            'needs revision',
                        description: '',
                        fromNodeId:
                            '357443aa-2aa4'
                            + '-4c1b-8293'
                            + '-2f55a49a83e6',
                        toNodeId:
                            'bfe39522-9b30'
                            + '-4db4-a8af'
                            + '-8b9acc02a8fe',
                    },
                    {
                        id: '58aa5414-b787'
                            + '-401e-80ec'
                            + '-0494c00af9ff',
                        name: 'approve',
                        description: '',
                        fromNodeId:
                            '357443aa-2aa4'
                            + '-4c1b-8293'
                            + '-2f55a49a83e6',
                        toNodeId:
                            'cfdd1f8c-8415'
                            + '-4610-8c6f'
                            + '-7504eb54ef4f',
                    },
                ],
            }),
            created_at: wfTimestamp,
            updated_at: wfTimestamp,
        },
        {
            id: '5569e404-e4ea-'
                + '4310-83f8'
                + '-0225a5f95311',
            name: 'Fusion Flow',
            description: '',
            is_locked: false,
            is_auto_layout: true,
            is_auto_fit: true,
            lock_timeout:
                DEFAULT_LOCK_TIMEOUT,
            graph: jsonObjectField({
                nodes: [
                    {
                        id: '207852d5-38f5'
                            + '-4271-bf42'
                            + '-73339e9ec0e8',
                        name: 'Start',
                        description: '',
                        positionX: -702,
                        positionY: -236,
                        isStart: true,
                        isComplete: false,
                        fields: [],
                    },
                    {
                        id: 'f59ba944-c3fc'
                            + '-45a1-841e'
                            + '-b7f1174aa7fa',
                        name: 'End',
                        description: '',
                        positionX: 436,
                        positionY: 358,
                        isStart: false,
                        isComplete: true,
                        fields: [],
                    },
                    {
                        id: '74e1ca84-949b'
                            + '-40de-b314'
                            + '-9ea5eee39e31',
                        name: 'Ideas',
                        description: '',
                        positionX: -406,
                        positionY: -234,
                        isStart: false,
                        isComplete: false,
                        fields: [],
                    },
                    {
                        id: 'f3fffa30-5f51'
                            + '-4efe-91cd'
                            + '-2222ba9a3117',
                        name:
                            'Describe problem',
                        description: '',
                        positionX: -82,
                        positionY: -230,
                        isStart: false,
                        isComplete: false,
                        fields: [],
                    },
                    {
                        id: 'ada32086-c2f2'
                            + '-4e5c-8c1e'
                            + '-37a4e1573665',
                        name: 'Who Benefits',
                        description: '',
                        positionX: 187,
                        positionY: -232,
                        isStart: false,
                        isComplete: false,
                        fields: [],
                    },
                    {
                        id: '8d1f590e-472b'
                            + '-475e-8aac'
                            + '-4d79ab1d343e',
                        name: 'Solution',
                        description: '',
                        positionX: 527,
                        positionY: -231,
                        isStart: false,
                        isComplete: false,
                        fields: [],
                    },
                    {
                        id: '2cbd3e93-2ff9'
                            + '-4963-b971'
                            + '-c7bd606fef75',
                        name: 'Outcome',
                        description: '',
                        positionX: 525,
                        positionY: -108,
                        isStart: false,
                        isComplete: false,
                        fields: [],
                    },
                    {
                        id: '2ba3a2b9-3c6a'
                            + '-47fe-bec1'
                            + '-4a12f0910109',
                        name: 'Edit Idea',
                        description: '',
                        positionX: 189,
                        positionY: -108,
                        isStart: false,
                        isComplete: false,
                        fields: [],
                    },
                    {
                        id: '314956fb-4323'
                            + '-4b42-96ec'
                            + '-026bf87ab767',
                        name: 'Cost',
                        description: '',
                        positionX: -409,
                        positionY: 22,
                        isStart: false,
                        isComplete: false,
                        fields: [],
                    },
                    {
                        id: '73d8c251-17c6'
                            + '-45ed-a4c5'
                            + '-c642db88d408',
                        name: 'Impact',
                        description: '',
                        positionX: -411,
                        positionY: 141,
                        isStart: false,
                        isComplete: false,
                        fields: [],
                    },
                    {
                        id: 'dd5a9515-007a'
                            + '-46fd-a2ef'
                            + '-cb529ad04e9b',
                        name: 'Category',
                        description: '',
                        positionX: -143,
                        positionY: -108,
                        isStart: false,
                        isComplete: false,
                        fields: [],
                    },
                    {
                        id: '8651a244-ca20'
                            + '-47ec-a8f4'
                            + '-10e8c3178499',
                        name: 'Time',
                        description: '',
                        positionX: -408,
                        positionY: -108,
                        isStart: false,
                        isComplete: false,
                        fields: [],
                    },
                    {
                        id: '3a4b7fe2-b948'
                            + '-4924-90fb'
                            + '-2a0a7aca1f45',
                        name: 'Idea',
                        description: '',
                        positionX: -412,
                        positionY: 278,
                        isStart: false,
                        isComplete: false,
                        fields: [],
                    },
                    {
                        id: '93a8a7be-7352'
                            + '-4fb5-806c'
                            + '-86528e9c37e1',
                        name: 'Idea',
                        description: '',
                        positionX: -140,
                        positionY: -3,
                        isStart: false,
                        isComplete: false,
                        fields: [],
                    },
                    {
                        id: '51d2755f-25d4'
                            + '-437b-9095'
                            + '-13034fc1a903',
                        name:
                            'Review Queue',
                        description: '',
                        positionX: 188,
                        positionY: -7,
                        isStart: false,
                        isComplete: false,
                        fields: [],
                    },
                    {
                        id: '1f228734-9e2c'
                            + '-4d38-9dc3'
                            + '-d3d45e172d10',
                        name:
                            'Approval Detail',
                        description: '',
                        positionX: 450,
                        positionY: 81,
                        isStart: false,
                        isComplete: false,
                        fields: [],
                    },
                    {
                        id: 'c29d8354-0fd0'
                            + '-4fe3-a5d6'
                            + '-f4e5f4c744ce',
                        name:
                            'Ideas approve',
                        description: '',
                        positionX: 143,
                        positionY: 274,
                        isStart: false,
                        isComplete: false,
                        fields: [],
                    },
                    {
                        id: 'f798510b-b580'
                            + '-44a3-b534'
                            + '-5d4adad96fc7',
                        name:
                            'Approval Detail',
                        description: '',
                        positionX: 448,
                        positionY: 214,
                        isStart: false,
                        isComplete: false,
                        fields: [],
                    },
                ],
                edges: [
                    {
                        id: 'a7c3e1f0-b4d5'
                            + '-4f16-8a27'
                            + '-c9d0e1f2a3b4',
                        name: 'Create Idea',
                        description: '',
                        fromNodeId:
                            '207852d5-38f5'
                            + '-4271-bf42'
                            + '-73339e9ec0e8',
                        toNodeId:
                            '74e1ca84-949b'
                            + '-40de-b314'
                            + '-9ea5eee39e31',
                    },
                    {
                        id: 'b8d4f201-c5e6'
                            + '-4027-9b38'
                            + '-d0e1f2a3b4c5',
                        name:
                            'Create Title',
                        description: '',
                        fromNodeId:
                            '74e1ca84-949b'
                            + '-40de-b314'
                            + '-9ea5eee39e31',
                        toNodeId:
                            'f3fffa30-5f51'
                            + '-4efe-91cd'
                            + '-2222ba9a3117',
                    },
                    {
                        id: 'c9e5a312-d6f7'
                            + '-4138-ac49'
                            + '-e1f2a3b4c5d6',
                        name: 'submit',
                        description: '',
                        fromNodeId:
                            'f3fffa30-5f51'
                            + '-4efe-91cd'
                            + '-2222ba9a3117',
                        toNodeId:
                            'ada32086-c2f2'
                            + '-4e5c-8c1e'
                            + '-37a4e1573665',
                    },
                    {
                        id: 'daf6b423-e708'
                            + '-4249-bd5a'
                            + '-f2a3b4c5d6e7',
                        name:
                            'describe'
                            + ' solution',
                        description: '',
                        fromNodeId:
                            'ada32086-c2f2'
                            + '-4e5c-8c1e'
                            + '-37a4e1573665',
                        toNodeId:
                            '8d1f590e-472b'
                            + '-475e-8aac'
                            + '-4d79ab1d343e',
                    },
                    {
                        id: 'ebc7c534-f819'
                            + '-435a-8e6b'
                            + '-a3b4c5d6e7f8',
                        name: 'Describe',
                        description: '',
                        fromNodeId:
                            '8d1f590e-472b'
                            + '-475e-8aac'
                            + '-4d79ab1d343e',
                        toNodeId:
                            '2cbd3e93-2ff9'
                            + '-4963-b971'
                            + '-c7bd606fef75',
                    },
                    {
                        id: 'fcd8d645-a92a'
                            + '-4b6b-9f7c'
                            + '-b4c5d6e7f8a9',
                        name:
                            'Define'
                            + ' & Measure',
                        description: '',
                        fromNodeId:
                            '2cbd3e93-2ff9'
                            + '-4963-b971'
                            + '-c7bd606fef75',
                        toNodeId:
                            '2ba3a2b9-3c6a'
                            + '-47fe-bec1'
                            + '-4a12f0910109',
                    },
                    {
                        id: 'ade9e756-ba3b'
                            + '-4c7c-aa8d'
                            + '-c5d6e7f8a9b0',
                        name:
                            'Click on field',
                        description: '',
                        fromNodeId:
                            '2ba3a2b9-3c6a'
                            + '-47fe-bec1'
                            + '-4a12f0910109',
                        toNodeId:
                            'dd5a9515-007a'
                            + '-46fd-a2ef'
                            + '-cb529ad04e9b',
                    },
                    {
                        id: 'befa0867-cb4c'
                            + '-4d8d-bb9e'
                            + '-d6e7f8a9b0c1',
                        name: 'Define',
                        description: '',
                        fromNodeId:
                            'dd5a9515-007a'
                            + '-46fd-a2ef'
                            + '-cb529ad04e9b',
                        toNodeId:
                            '8651a244-ca20'
                            + '-47ec-a8f4'
                            + '-10e8c3178499',
                    },
                    {
                        id: 'cfab1978-dc5d'
                            + '-4e9e-8caf'
                            + '-e7f8a9b0c1d2',
                        name: 'Estimate',
                        description: '',
                        fromNodeId:
                            '8651a244-ca20'
                            + '-47ec-a8f4'
                            + '-10e8c3178499',
                        toNodeId:
                            '314956fb-4323'
                            + '-4b42-96ec'
                            + '-026bf87ab767',
                    },
                    {
                        id: 'd0bc2a89-ed6e'
                            + '-4faf-9db0'
                            + '-f8a9b0c1d2e3',
                        name: 'Estimate',
                        description: '',
                        fromNodeId:
                            '314956fb-4323'
                            + '-4b42-96ec'
                            + '-026bf87ab767',
                        toNodeId:
                            '73d8c251-17c6'
                            + '-45ed-a4c5'
                            + '-c642db88d408',
                    },
                    {
                        id: 'e1cd3b9a-fe7f'
                            + '-4ab0-aec1'
                            + '-a9b0c1d2e3f4',
                        name: 'Estimate',
                        description: '',
                        fromNodeId:
                            '73d8c251-17c6'
                            + '-45ed-a4c5'
                            + '-c642db88d408',
                        toNodeId:
                            '3a4b7fe2-b948'
                            + '-4924-90fb'
                            + '-2a0a7aca1f45',
                    },
                    {
                        id: 'f2de4cab-af80'
                            + '-4bc1-bfd2'
                            + '-b0c1d2e3f4a5',
                        name: 'Submit',
                        description: '',
                        fromNodeId:
                            '3a4b7fe2-b948'
                            + '-4924-90fb'
                            + '-2a0a7aca1f45',
                        toNodeId:
                            '93a8a7be-7352'
                            + '-4fb5-806c'
                            + '-86528e9c37e1',
                    },
                    {
                        id: 'a3ef5dbc-b091'
                            + '-4cd2-80e3'
                            + '-c1d2e3f4a5b6',
                        name: 'Review',
                        description: '',
                        fromNodeId:
                            '93a8a7be-7352'
                            + '-4fb5-806c'
                            + '-86528e9c37e1',
                        toNodeId:
                            '51d2755f-25d4'
                            + '-437b-9095'
                            + '-13034fc1a903',
                    },
                    {
                        id: 'b4f06ecd-c1a2'
                            + '-4de3-91f4'
                            + '-d2e3f4a5b6c7',
                        name: 'Select',
                        description: '',
                        fromNodeId:
                            '51d2755f-25d4'
                            + '-437b-9095'
                            + '-13034fc1a903',
                        toNodeId:
                            '1f228734-9e2c'
                            + '-4d38-9dc3'
                            + '-d3d45e172d10',
                    },
                    {
                        id: 'c5a17fde-d2b3'
                            + '-4ef4-a2a5'
                            + '-e3f4a5b6c7d8',
                        name: 'Decline',
                        description: '',
                        fromNodeId:
                            '1f228734-9e2c'
                            + '-4d38-9dc3'
                            + '-d3d45e172d10',
                        toNodeId:
                            '51d2755f-25d4'
                            + '-437b-9095'
                            + '-13034fc1a903',
                    },
                    {
                        id: 'd6b280ef-e3c4'
                            + '-4f05-b3b6'
                            + '-f4a5b6c7d8e9',
                        name: 'Review',
                        description: '',
                        fromNodeId:
                            '1f228734-9e2c'
                            + '-4d38-9dc3'
                            + '-d3d45e172d10',
                        toNodeId:
                            'f798510b-b580'
                            + '-44a3-b534'
                            + '-5d4adad96fc7',
                    },
                    {
                        id: 'e7c391f0-f4d5'
                            + '-4016-84c7'
                            + '-a5b6c7d8e9f0',
                        name: 'Approve',
                        description: '',
                        fromNodeId:
                            'f798510b-b580'
                            + '-44a3-b534'
                            + '-5d4adad96fc7',
                        toNodeId:
                            'c29d8354-0fd0'
                            + '-4fe3-a5d6'
                            + '-f4e5f4c744ce',
                    },
                    {
                        id: 'f8d4a201-a5e6'
                            + '-4b27-95d8'
                            + '-b6c7d8e9f0a1',
                        name: 'Released',
                        description: '',
                        fromNodeId:
                            'c29d8354-0fd0'
                            + '-4fe3-a5d6'
                            + '-f4e5f4c744ce',
                        toNodeId:
                            'f59ba944-c3fc'
                            + '-45a1-841e'
                            + '-b7f1174aa7fa',
                    },
                ],
            }),
            created_at: wfTimestamp,
            updated_at: wfTimestamp,
        },
        {
            id: '1a700001-0000-4000-8000-000000000001',
            name:
                'Layout Test: Proposal Review Cycle',
            description:
                'Exercises multi-exit fans, nested'
                + ' decisions, convergence, and'
                + ' cycles for Auto Layout testing',
            is_locked: false,
            is_auto_layout: true,
            is_auto_fit: true,
            lock_timeout: DEFAULT_LOCK_TIMEOUT,
            graph: jsonObjectField({
                nodes: [
                    {
                        id: '1a700001-0002-4000-8000-000000000001',
                        name: 'Start',
                        description: '',
                        positionX: 0,
                        positionY: 0,
                        isStart: true,
                        isComplete: false,
                        fields: [],
                    },
                    {
                        id: '1a700001-0002-4000-8000-000000000002',
                        name: 'Draft',
                        description: '',
                        positionX: 0,
                        positionY: 0,
                        isStart: false,
                        isComplete: false,
                        fields: [],
                    },
                    {
                        id: '1a700001-0002-4000-8000-000000000003',
                        name: 'Submit',
                        description: '',
                        positionX: 0,
                        positionY: 0,
                        isStart: false,
                        isComplete: false,
                        fields: [],
                    },
                    {
                        id: '1a700001-0002-4000-8000-000000000004',
                        name: 'Triage',
                        description: '',
                        positionX: 0,
                        positionY: 0,
                        isStart: false,
                        isComplete: false,
                        fields: [],
                    },
                    {
                        id: '1a700001-0002-4000-8000-000000000005',
                        name: 'Quick Review',
                        description: '',
                        positionX: 0,
                        positionY: 0,
                        isStart: false,
                        isComplete: false,
                        fields: [],
                    },
                    {
                        id: '1a700001-0002-4000-8000-000000000006',
                        name: 'Standard Review',
                        description: '',
                        positionX: 0,
                        positionY: 0,
                        isStart: false,
                        isComplete: false,
                        fields: [],
                    },
                    {
                        id: '1a700001-0002-4000-8000-000000000007',
                        name: 'Deep Review',
                        description: '',
                        positionX: 0,
                        positionY: 0,
                        isStart: false,
                        isComplete: false,
                        fields: [],
                    },
                    {
                        id: '1a700001-0002-4000-8000-000000000008',
                        name: 'Panel A',
                        description: '',
                        positionX: 0,
                        positionY: 0,
                        isStart: false,
                        isComplete: false,
                        fields: [],
                    },
                    {
                        id: '1a700001-0002-4000-8000-000000000009',
                        name: 'Panel B',
                        description: '',
                        positionX: 0,
                        positionY: 0,
                        isStart: false,
                        isComplete: false,
                        fields: [],
                    },
                    {
                        id: '1a700001-0002-4000-8000-000000000010',
                        name: 'Panel C',
                        description: '',
                        positionX: 0,
                        positionY: 0,
                        isStart: false,
                        isComplete: false,
                        fields: [],
                    },
                    {
                        id: '1a700001-0002-4000-8000-000000000011',
                        name: 'Panel D',
                        description: '',
                        positionX: 0,
                        positionY: 0,
                        isStart: false,
                        isComplete: false,
                        fields: [],
                    },
                    {
                        id: '1a700001-0002-4000-8000-000000000012',
                        name: 'Consolidate',
                        description: '',
                        positionX: 0,
                        positionY: 0,
                        isStart: false,
                        isComplete: false,
                        fields: [],
                    },
                    {
                        id: '1a700001-0002-4000-8000-000000000013',
                        name: 'Decision',
                        description: '',
                        positionX: 0,
                        positionY: 0,
                        isStart: false,
                        isComplete: false,
                        fields: [],
                    },
                    {
                        id: '1a700001-0002-4000-8000-000000000014',
                        name: 'Approved',
                        description: '',
                        positionX: 0,
                        positionY: 0,
                        isStart: false,
                        isComplete: false,
                        fields: [],
                    },
                    {
                        id: '1a700001-0002-4000-8000-000000000015',
                        name: 'Revise',
                        description: '',
                        positionX: 0,
                        positionY: 0,
                        isStart: false,
                        isComplete: false,
                        fields: [],
                    },
                    {
                        id: '1a700001-0002-4000-8000-000000000016',
                        name: 'Rejected',
                        description: '',
                        positionX: 0,
                        positionY: 0,
                        isStart: false,
                        isComplete: false,
                        fields: [],
                    },
                    {
                        id: '1a700001-0002-4000-8000-000000000017',
                        name: 'End',
                        description: '',
                        positionX: 0,
                        positionY: 0,
                        isStart: false,
                        isComplete: true,
                        fields: [],
                    },
                ],
                edges: [
                    {
                        id: '1a700001-0003-4000-8000-000000000001',
                        name: 'begin',
                        description: '',
                        fromNodeId:
                            '1a700001-0002-4000-8000-000000000001',
                        toNodeId:
                            '1a700001-0002-4000-8000-000000000002',
                    },
                    {
                        id: '1a700001-0003-4000-8000-000000000002',
                        name: 'ready',
                        description: '',
                        fromNodeId:
                            '1a700001-0002-4000-8000-000000000002',
                        toNodeId:
                            '1a700001-0002-4000-8000-000000000003',
                    },
                    {
                        id: '1a700001-0003-4000-8000-000000000003',
                        name: 'submitted',
                        description: '',
                        fromNodeId:
                            '1a700001-0002-4000-8000-000000000003',
                        toNodeId:
                            '1a700001-0002-4000-8000-000000000004',
                    },
                    {
                        id: '1a700001-0003-4000-8000-000000000004',
                        name: 'quick',
                        description: '',
                        fromNodeId:
                            '1a700001-0002-4000-8000-000000000004',
                        toNodeId:
                            '1a700001-0002-4000-8000-000000000005',
                    },
                    {
                        id: '1a700001-0003-4000-8000-000000000005',
                        name: 'standard',
                        description: '',
                        fromNodeId:
                            '1a700001-0002-4000-8000-000000000004',
                        toNodeId:
                            '1a700001-0002-4000-8000-000000000006',
                    },
                    {
                        id: '1a700001-0003-4000-8000-000000000006',
                        name: 'deep',
                        description: '',
                        fromNodeId:
                            '1a700001-0002-4000-8000-000000000004',
                        toNodeId:
                            '1a700001-0002-4000-8000-000000000007',
                    },
                    {
                        id: '1a700001-0003-4000-8000-000000000007',
                        name: 'panel A',
                        description: '',
                        fromNodeId:
                            '1a700001-0002-4000-8000-000000000007',
                        toNodeId:
                            '1a700001-0002-4000-8000-000000000008',
                    },
                    {
                        id: '1a700001-0003-4000-8000-000000000008',
                        name: 'panel B',
                        description: '',
                        fromNodeId:
                            '1a700001-0002-4000-8000-000000000007',
                        toNodeId:
                            '1a700001-0002-4000-8000-000000000009',
                    },
                    {
                        id: '1a700001-0003-4000-8000-000000000009',
                        name: 'panel C',
                        description: '',
                        fromNodeId:
                            '1a700001-0002-4000-8000-000000000007',
                        toNodeId:
                            '1a700001-0002-4000-8000-000000000010',
                    },
                    {
                        id: '1a700001-0003-4000-8000-000000000010',
                        name: 'panel D',
                        description: '',
                        fromNodeId:
                            '1a700001-0002-4000-8000-000000000007',
                        toNodeId:
                            '1a700001-0002-4000-8000-000000000011',
                    },
                    {
                        id: '1a700001-0003-4000-8000-000000000011',
                        name: 'A done',
                        description: '',
                        fromNodeId:
                            '1a700001-0002-4000-8000-000000000008',
                        toNodeId:
                            '1a700001-0002-4000-8000-000000000012',
                    },
                    {
                        id: '1a700001-0003-4000-8000-000000000012',
                        name: 'B done',
                        description: '',
                        fromNodeId:
                            '1a700001-0002-4000-8000-000000000009',
                        toNodeId:
                            '1a700001-0002-4000-8000-000000000012',
                    },
                    {
                        id: '1a700001-0003-4000-8000-000000000013',
                        name: 'C done',
                        description: '',
                        fromNodeId:
                            '1a700001-0002-4000-8000-000000000010',
                        toNodeId:
                            '1a700001-0002-4000-8000-000000000012',
                    },
                    {
                        id: '1a700001-0003-4000-8000-000000000014',
                        name: 'D done',
                        description: '',
                        fromNodeId:
                            '1a700001-0002-4000-8000-000000000011',
                        toNodeId:
                            '1a700001-0002-4000-8000-000000000012',
                    },
                    {
                        id: '1a700001-0003-4000-8000-000000000015',
                        name: 'to decision',
                        description: '',
                        fromNodeId:
                            '1a700001-0002-4000-8000-000000000005',
                        toNodeId:
                            '1a700001-0002-4000-8000-000000000013',
                    },
                    {
                        id: '1a700001-0003-4000-8000-000000000016',
                        name: 'to decision',
                        description: '',
                        fromNodeId:
                            '1a700001-0002-4000-8000-000000000006',
                        toNodeId:
                            '1a700001-0002-4000-8000-000000000013',
                    },
                    {
                        id: '1a700001-0003-4000-8000-000000000017',
                        name: 'synthesized',
                        description: '',
                        fromNodeId:
                            '1a700001-0002-4000-8000-000000000012',
                        toNodeId:
                            '1a700001-0002-4000-8000-000000000013',
                    },
                    {
                        id: '1a700001-0003-4000-8000-000000000018',
                        name: 'approve',
                        description: '',
                        fromNodeId:
                            '1a700001-0002-4000-8000-000000000013',
                        toNodeId:
                            '1a700001-0002-4000-8000-000000000014',
                    },
                    {
                        id: '1a700001-0003-4000-8000-000000000019',
                        name: 'revise',
                        description: '',
                        fromNodeId:
                            '1a700001-0002-4000-8000-000000000013',
                        toNodeId:
                            '1a700001-0002-4000-8000-000000000015',
                    },
                    {
                        id: '1a700001-0003-4000-8000-000000000020',
                        name: 'reject',
                        description: '',
                        fromNodeId:
                            '1a700001-0002-4000-8000-000000000013',
                        toNodeId:
                            '1a700001-0002-4000-8000-000000000016',
                    },
                    {
                        id: '1a700001-0003-4000-8000-000000000021',
                        name: 'done',
                        description: '',
                        fromNodeId:
                            '1a700001-0002-4000-8000-000000000014',
                        toNodeId:
                            '1a700001-0002-4000-8000-000000000017',
                    },
                    {
                        id: '1a700001-0003-4000-8000-000000000022',
                        name: 'done',
                        description: '',
                        fromNodeId:
                            '1a700001-0002-4000-8000-000000000016',
                        toNodeId:
                            '1a700001-0002-4000-8000-000000000017',
                    },
                    {
                        id: '1a700001-0003-4000-8000-000000000023',
                        name: 'back to draft',
                        description: '',
                        fromNodeId:
                            '1a700001-0002-4000-8000-000000000015',
                        toNodeId:
                            '1a700001-0002-4000-8000-000000000002',
                    },
                ],
            }),
            created_at: wfTimestamp,
            updated_at: wfTimestamp,
        },
    ];

    const woId =
        'e1a2b3c4-d5e6-4f78'
        + '-9a0b-1c2d3e4f5a6b';
    const woFlowGraph =
        mockFlows[0]!.graph;
    const woCreated = dt(14, 10, 0);
    const woNodeNew =
        '7c6c4356-a06b'
        + '-4f43-99ac'
        + '-9a481baf70f1';
    const woNodeCapture =
        'bfe39522-9b30'
        + '-4db4-a8af'
        + '-8b9acc02a8fe';
    const woNodeReview =
        '357443aa-2aa4'
        + '-4c1b-8293'
        + '-2f55a49a83e6';
    const woNodeComplete =
        'cfdd1f8c-8415'
        + '-4610-8c6f'
        + '-7504eb54ef4f';
    const woUserSarah =
        'a0facefa-e853-4d92'
        + '-b796-373da78aba93';
    const woUserMike =
        '846cf47c-26b9-4b65'
        + '-8a45-6584380a7307';
    const fCompanyName =
        '9ee5e0cb-6485-452d'
        + '-8738-a8ca92ea62dc';
    const fEmail =
        '1076b0ff-3502-4cbe'
        + '-b41b-bd64b2a2cc49';
    const fPhone =
        'd597e67f-e37b-4189'
        + '-aa50-c6e8cc4fd9be';
    const fIndustry =
        '361a0441-a634-4ff9'
        + '-b4d1-b9528950bf41';
    const fRevenue =
        '581fc85d-6954-42fd'
        + '-910c-1674970f174f';
    const fEmployees =
        '76792667-d2ff-48ab'
        + '-b078-01d5d1bf187c';
    const fReviewerNotes =
        '542af865-0bd3-4653'
        + '-8de6-308ae793c996';

    const mockWorkOrders:
        WorkOrderEntity[] = [
        {
            id: woId,
            display_id: 'a7c3e1f9',
            flow_graph: jsonObjectField({
                flowId:
                    'b07adeaa-7484-49be'
                    + '-a9d7-5652555c9f7f',
                name:
                    'Customer Onboarding',
                description:
                    'Standard customer'
                    + ' onboarding'
                    + ' process',
                lockTimeout:
                    DEFAULT_LOCK_TIMEOUT,
                nodes: JSON.parse(
                    woFlowGraph,
                ).nodes,
                edges: JSON.parse(
                    woFlowGraph,
                ).edges,
            }),
            position: 1,
            created_at: woCreated,
        },
    ];

    const mockFlowWorkOrders:
        FlowWorkOrderEntity[] = [
        {
            id: 'fwo-' + woId,
            flow_id:
                'b07adeaa-7484-49be'
                + '-a9d7-5652555c9f7f',
            work_order_id: woId,
            created_at: woCreated,
        },
    ];

    const mockWoTransitions:
        WorkOrderTransitionEntity[] = [
        {
            id: 'wot-01-' + woId,
            work_order_id: woId,
            from_node_id: '',
            to_node_id: woNodeNew,
            user_id: woUserSarah,
            values: jsonObjectField({}),
            transitioned_at:
                woCreated,
        },
        {
            id: 'wot-02-' + woId,
            work_order_id: woId,
            from_node_id: woNodeNew,
            to_node_id: woNodeCapture,
            user_id: woUserSarah,
            values: jsonObjectField({}),
            transitioned_at:
                woCreated,
        },
        {
            id: 'wot-03-' + woId,
            work_order_id: woId,
            from_node_id:
                woNodeCapture,
            to_node_id: woNodeReview,
            user_id: woUserMike,
            values: jsonObjectField({
                [fCompanyName]:
                    'Acme Corp',
                [fEmail]:
                    'onboard@acme.com',
                [fPhone]:
                    '+1-555-0100',
                [fIndustry]:
                    'Technology',
                [fRevenue]: '5000000',
                [fEmployees]: '250',
            }),
            transitioned_at:
                dt(13, 14, 30),
        },
        {
            id: 'wot-04-' + woId,
            work_order_id: woId,
            from_node_id:
                woNodeReview,
            to_node_id:
                woNodeComplete,
            user_id: woUserSarah,
            values: jsonObjectField({
                [fReviewerNotes]:
                    'Approved.'
                    + ' Strong fit.',
            }),
            transitioned_at:
                dt(12, 9, 15),
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
        {
            id: 'c7e5a302-1b34-4f56-9d78-ab9c0d1e2f3a',
            project_id: '8b75e9ca-76ed-42c0-b496-699eb5a2e400',
            flow_id: '5569e404-e4ea-4310-83f8-0225a5f95311',
            created_at: wfTimestamp,
        },
        {
            id: '1a700001-0001-4000-8000-000000000001',
            project_id: 'd04b29ad-cc85-4830-adc2-96b1e434d1d0',
            flow_id: '1a700001-0000-4000-8000-000000000001',
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
        ...mockFlows.map(flow =>
            adapter.flows.put(
                flow.id, flow,
            ),
        ),
    ]);

    const teams: {
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
        ...teams.map(tm =>
            adapter.teams.put(
                tm.id,
                {
                    role: tm.role,
                    type: tm.type,
                },
            ),
        ),
        ...teams.map(tm =>
            adapter.teamProjects
                .put(`tmp-${tm.id}`, {
                    team_id:
                        tm.id,
                    project_id:
                        tm.project_id,
                    created_at: dt(75),
                }),
        ),
        ...teams.map(tm =>
            adapter.teamUsers
                .put(`tmu-${tm.id}`, {
                    team_id:
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
        ...mockWorkOrders.map(r =>
            adapter.workOrders.put(
                r.id, r,
            ),
        ),
        ...mockFlowWorkOrders.map(r =>
            adapter.flowWorkOrders.put(
                r.id, r,
            ),
        ),
        ...mockWoTransitions.map(r =>
            adapter.workOrderTransitions
                .put(r.id, r),
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
        adapter.company.put({
            name: 'Stark Industries',
            domain: 'acmecorp.com',
        }),
        adapter.organization.put({
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
