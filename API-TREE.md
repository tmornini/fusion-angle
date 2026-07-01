Take a look at this URI schema.

Please analyze how this fits into the applications's state needs, what verbs need to be implemented, what's missing, etc.

Know that every entity will be kept in a backend structured in this way: ~/.claude/plans/go-to-church-binary-stonebraker.md.

That mechanism will replace the existing ledger's and common states system by moving said state into each message stored message.

└─|─ /invitations/
  |  └── :id
└─|─ /memberships/
  |  └── :id
└─|─ /records/
  |  └── :id
  |      └── /attribute-definitions.          • all of them, single document
  |      └── /attribute-values                • all of them, single document
└─|─ work-orders/
  |  └── :id/
  |      └── claim
  |      └── transition
└─|─ /identities/
  |  └── :id                                   • default-organization is an attribute of the identity itself
  |      └─|─ /credentials                     • all of them, single document
  |      └─|─ /notifications                   • postgres LISTEN/NOTIFY for all changes to identity
  |      └─|─ /pii                             • full physical removal from the DB required, i.e. physical delete, all others: Delete-At: header
  |      └─|─ /role-grants                     • all of them, single document
  |      └─|─ /third-party-identity-providers  • all of them, single document
  |      └─|─ /token-revocations               • if the answer to the question directly above is "PUT/GET"
  |      └─|─ /memberships/                    • /memberships/ with forced and/or filtered identity
  |      └─|─ /organizations/                  • /memberships/ with forced and/or filtered identity
  |      └─|─ /work-orders/                    • /work-orders/ with forced and/or filtered identity
  |      └─|─ /tokens/
  |        |  └── :id
  |        |      ├── /rotation                • is this a POST?
  |        |      └── /revocation              • is this a POST?
  |        |      └── /revocation              • is this a POST, if not, a PUT/GET pair?
  |        \
  |         \- identity authz realm 
└─|─ /organizations/
  |  └─|─ :id
  |    |  └── /notifications                  • postgres LISTEN/NOTIFY for all changes to organization
  |    |  └── /objectives                     • all objectives in a single document
  |    |  └── /flows/
  |    |      └── :id
  |    |          ├── /undo
  |    |          └── /redo
  |    |  └── /ideas/
  |    |      └── :id
  |    |  └── /memberships/                   • /memberships/ with forced and/or filtered organization
  |    |  └── /projects/
  |    |      └── :id
  |    |          └── /scores                 • all objectives scores in a single document
  |    |  └── /records/                       • /records/ with forced and/or filtered organization
  |    |  └── /work-orders/                   • /work-orders/ with forced and/or filtered organization
  \    \
   \    \- organization membership authz realm
    \- administration authz realm

└─|─ index.html
└─|─ /authentication/
  |  ├── token
  |  └── authorize
└─|─ /snapshots/
  |  └── export
  |  └── import
  |  └── mock-data
  |  └── pristine
  \
   \- public realm
