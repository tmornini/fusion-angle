import type {
    HumanMemberEntity,
} from '../types.ts';

export type SeedHumanMember = Omit<
    HumanMemberEntity,
    'strengths' | 'team_dimensions'
> & {
    // Contact PII lives in identity_pii, not the
    // human_members detail row. The seed carries it
    // here and the writer routes it into the PII row.
    name: string;
    email: string;
    phone: string;
    bio: string;
    strengths: string[];
    team_dimensions: Record<
        string, number
    >;
};

export function buildMembers():
    SeedHumanMember[] {
    return [
        {
            id: 'MQFcPtrZPIGjMCRAXtZUnA',
            name: 'Sarah Chen',
            email: 'sarah.chen@company.com',
            title: 'Project Lead',
            department: 'Operations',
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
        },
        {
            id: 'VvzFEpfYONDAsCCwNlIFCQ',
            name: 'Mike Thompson',
            email: 'mike.thompson@company.com',
            title: 'ML Engineer',
            department: 'Engineering',
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
        },
        {
            id: 'zyGBRshxOnKHUfcyFRqowg',
            name: 'Jessica Park',
            email: 'jessica.park@company.com',
            title: 'Data Scientist',
            department: 'Analytics',
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
        },
        {
            id: 'DAjUkaBUIZbXSQeoLDZEXQ',
            name: 'David Martinez',
            email: 'david.martinez@company.com',
            title: 'Backend Developer',
            department: 'Engineering',
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
        },
        {
            id: 'CJrglMsNBxOWWfbihHQSeg',
            name: 'Emily Rodriguez',
            email: 'emily.rodriguez@company.com',
            title: 'UX Designer',
            department: 'Design',
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
        },
        {
            id: 'IzdIgJaTTfIZQUudGcmdtA',
            name: 'Alex Kim',
            email: 'alex.kim@company.com',
            title: 'Product Manager',
            department: 'Product',
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
        },
        {
            id: 'SsVAZghfSzMZRZmxNKIizw',
            name: 'Marcus Johnson',
            email: 'marcus@acmecorp.com',
            title: 'manager',
            department: 'Product',
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
        },
        {
            id: 'jrMOZzVdWXvLgMpcHoyBTw',
            name: 'David Kim',
            email: 'david.kim@company.com',
            title: 'member',
            department: 'Engineering',
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
        },
        {
            id: 'RPzLGrWcstxLaHoBcViPLQ',
            name: 'Lisa Wang',
            email: 'lisa@acmecorp.com',
            title: 'viewer',
            department: 'Sales',
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
        },
        {
            id: 'ovKCDVqguNMVIiAyjSYeIg',
            name: 'James Miller',
            email: 'james@acmecorp.com',
            title: 'member',
            department: 'Engineering',
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
        },
        {
            id: 'XXZruirZyAOoRpNxaDnpSA',
            name: 'Tony Stark',
            email: 'demo@example.com',
            title: 'Admin',
            department: 'Product',
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
        },
    ];
}
