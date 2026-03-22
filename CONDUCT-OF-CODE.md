# Conduct of Code

All code in this project, and the process of
creating it, must adhere to these strictures.
These rules are inviolate, not aspirational.
Violations are defects.

In order of importance, from most to least:

- reliable - the bedrock upon which everything we do rests
- secure - security breaches are to be avoided
- uniform - call a thing a thing in all aspects of what we do
- logical - we strive to be less wrong and less fallacious
- clear - we emphasize dense, high information communication
  - no equivocation — say what is true, not what sounds reasonable
  - no reframing failures as scope constraints
- immutable nouns - limit the need to ask "Why did THAT happen?"
- idempotent - HTTP > SQL, PUT/DELETE/POST > CRUD, but Postgres is the shiz
- simple - if I had more time I'd have written a shorter letter -- Blaise Pascal
- atomic - avoid at all costs, thank your God for giving it to you when you can't
- snappy - low latency is godliness, essential for UI and high frequency serial ops
- general - never before exploratory duplication, snappiness development progress rules
- efficient - true if above are adhered to, disastrous when focused on prematurely
- perfect - asymptotically achievable, generally many years of considerations and iteration

We detest:

- global variables
- asking, don't tell
  - we never ask objects for internal attribute values
- nullable attributes in persisted nouns
- foreign keys in nouns
- obscurity
- cleverness
- magical values
- default values — in all forms
  - schema column defaults
  - function parameter defaults
  - fallback objects and factories
  - silent coercion (`?? ''`, `|| fallback`)
  - default values mask absence of real data
  - this does not apply to display formatting
    that renders absence visually (e.g. em-dash)
    — presentation transforms are not coercion
- premature optimization
- polling for state changes

We adore:

- S.O.L.I.D. techniques (<https://en.wikipedia.org/wiki/SOLID>)
- tell, don't ask
  - we tell objects what we need or what to do
  - this allows us to exploit polymorphism, which allows generality
- relationship entities storing relationships between nouns
  - should only store noun IDs and when the relationship was formed
- being informed or notified of state changes
- validate at entity creation boundaries
  - every noun entity attribute is NOT NULL
  - enforced on instantiation, not downstream
  - trust data after validation — no internal
    defensive coding against your own data model
  - defend only against external reality: user input,
    storage corruption, DOM API, async failure

We handle and persist timestamps uniformly:

- store times in UTC with microsecond resolution
- convert to local time for UI display only
- serialize timestamps in RFC-3339 Zulu timezone

We create UIs that are:

- intuitive
- accessible
- beautiful
- avoid configurability

We write and maintain comments when code is:

- difficult - simplify rather than comment
- unintuitive - make intuitive before comment
- we abide by our strictures rather than write comments

We format code:

- wrapped at 78 characters maximum length
- unless language or format require otherwise
  - no tabs
  - indent with 4 spaces 
  - no trailing whitespace, other than newline
  - newline required after last line in file

We commit code:

- frequently, --amend --no-edit is a thing, you can't commit too frequently
- before building, which requires a clean working directory
- in tiny, semantically continguous and exclusive chunks
  - code must build, function properly and pass tests at each commit
    - you can commit broken code, but you can never push a broken commit
  - with a single line message about 50 characters in length
    - is a high level description
    - completes the sentence that begins "When applied, this commit will: "
      - e.g. "refactor login functionality"
    - if you think your commit demands a message with a subject line and body
      - your commit is too large, use git commit -p like pro
  - that never moves or renames file(s) and changes its (their) content simultaneously
- rarely mentions file names, paths, pathnames or function names
  - codebase reorganizations moves and renames may
  - pure function and/or file renaming may
  - moves and renames always denoted as
    - before -> after
  - paths and pathnames always relative to repo root
