# Writes db/seed/test_seed.sql: a small, hand-shaped corpus with known answers for the pgTAP tests.
# Run once; the generated SQL is committed.
import random
random.seed(7)

papers = [
 # id, title, date, venue, work_type, oa, oa_status, cited_by, doi, arxiv, primary topic
 (1,"Event-driven learning rules for spiking neurons","2015-03-02",5,"ARTICLE",True,"GOLD",410,"10.3389/fnins.2015.00101",None,4),
 (2,"Surrogate gradients for deep spiking networks","2016-06-10",3,"PREPRINT",True,"GREEN",380,None,"1606.01234",4),
 (3,"Self-attention as a universal sequence model","2017-06-12",1,"PROCEEDINGS",True,"GREEN",5200,"10.48550/arxiv.1706.00001","1706.00001",5),
 (4,"Energy-efficient spiking convolutional networks","2018-01-20",2,"ARTICLE",False,"CLOSED",260,"10.1038/s42256-018-0004-1",None,4),
 (5,"Pretraining bidirectional encoders with masked tokens","2018-10-11",3,"PREPRINT",True,"GREEN",4100,None,"1810.04805",5),
 (6,"Region proposals for real-time object detection","2018-04-02",4,"PROCEEDINGS",True,"GREEN",900,None,"1804.02767",7),
 (7,"Temporal coding in spiking transformers","2019-05-04",5,"ARTICLE",True,"GOLD",150,"10.3389/fnins.2019.00415",None,4),
 (8,"Scaling language models with sparse attention","2019-04-23",4,"PROCEEDINGS",True,"GREEN",800,None,"1904.10509",5),
 (9,"Deep learning for ICU mortality prediction","2019-08-15",2,"ARTICLE",False,"CLOSED",300,"10.1038/s42256-019-0081-0",None,11),
 (10,"Retrieval-augmented generation for open-domain QA","2020-05-22",1,"PROCEEDINGS",True,"GREEN",2100,None,"2005.11401",5),
 (11,"Vision transformers for image recognition at scale","2020-10-22",4,"PROCEEDINGS",True,"GREEN",3000,None,"2010.11929",7),
 (12,"Spiking neural networks meet attention","2021-02-14",2,"ARTICLE",True,"HYBRID",120,"10.1038/s42256-021-00301-1",None,4),
 (13,"Benchmarking clinical time-series models","2021-03-30",3,"PREPRINT",True,"GREEN",90,None,"2103.11111",11),
 (14,"Efficient transformers: a survey","2021-09-14",3,"REVIEW",True,"GREEN",700,None,"2109.12345",5),
 (15,"Neuromorphic hardware for edge inference","2021-11-02",2,"ARTICLE",False,"CLOSED",60,"10.1038/s42256-021-00399-z",None,4),
 (16,"Detection transformers with deformable attention","2022-01-10",4,"PROCEEDINGS",True,"GREEN",500,None,"2201.01234",7),
 (17,"Federated learning on electronic health records","2022-04-18",2,"ARTICLE",True,"GOLD",80,"10.1038/s42256-022-00470-1",None,11),
 (18,"Spike-driven language models","2023-02-01",1,"PROCEEDINGS",True,"GREEN",75,None,"2302.00001",4),
 (19,"Instruction tuning at scale","2022-10-20",3,"PREPRINT",True,"GREEN",650,None,"2210.11416",5),
 (20,"Long-context retrieval for language models","2023-07-11",4,"PROCEEDINGS",True,"GREEN",210,None,"2307.03172",5),
 (21,"Masked autoencoders for medical imaging","2022-06-30",2,"ARTICLE",True,"GOLD",140,"10.1038/s42256-022-00500-2",None,7),
 (22,"Fabricated gains in spiking benchmark results","2022-03-15",5,"ARTICLE",True,"GOLD",40,"10.3389/fnins.2022.00222",None,4),
 (23,"Graph attention for patient similarity","2023-01-05",3,"PREPRINT",True,"GREEN",35,None,"2301.02222",11),
 (24,"Low-power spiking detectors built on prior benchmarks","2023-05-20",5,"ARTICLE",True,"GOLD",25,"10.3389/fnins.2023.00240",None,4),
 (25,"Agentic retrieval with tool use","2024-02-02",1,"PROCEEDINGS",True,"GREEN",160,None,"2402.00002",5),
 (26,"Multimodal clinical foundation models","2024-04-04",2,"ARTICLE",False,"CLOSED",55,"10.1038/s42256-024-00800-1",None,11),
 (27,"Event cameras and spiking detectors","2024-06-06",5,"ARTICLE",True,"GOLD",12,"10.3389/fnins.2024.00270",None,7),
 (28,"Sparse mixture-of-experts transformers","2024-09-09",4,"PROCEEDINGS",True,"GREEN",140,None,"2409.00009",5),
 (29,"Spiking state-space models","2025-01-15",3,"PREPRINT",True,"GREEN",8,None,"2501.00015",4),
 (30,"An unclassified note on reproducibility","2025-03-03",None,"OTHER",False,None,2,None,None,None),
]
# citing -> cited (always later -> earlier)
citations = [
 (2,1),(4,2),(4,1),(7,4),(7,3),(12,7),(12,3),(15,4),(18,12),(18,10),(22,4),(24,22),(27,24),(29,18),(29,12),
 (5,3),(8,3),(8,5),(10,5),(10,8),(11,3),(14,8),(14,10),(14,11),(16,11),(16,6),(19,5),(20,10),(20,14),(25,20),(25,19),(28,14),
 (9,3),(13,9),(17,9),(21,11),(23,13),(23,9),(26,17),(26,21),(26,5),(27,16),(28,19),
]
authors = [
 (1,"Asha Rao","0000-0001-2345-6789",3),(2,"Lukas Meier","0000-0002-1111-222X",1),(3,"Priya Nair",None,5),
 (4,"Daniel Okafor",None,2),(5,"Mei Chen","0000-0003-0000-0001",4),(6,"Rahul Verma",None,3),
 (7,"Sofia Rossi",None,1),(8,"Tom Becker",None,2),(9,"Ananya Iyer",None,5),(10,"Jonas Weber",None,None),
]
# paper -> list of authors in order
auth = {}
pool = {4:[1,2,6,7],5:[4,5,8,10],7:[5,8,3],11:[3,9,6]}
for p in papers:
    t = p[10]
    cand = pool.get(t, [1,3,10])
    n = 1 + (p[0] % 3)
    chosen = []
    for k in range(n):
        a = cand[(p[0] + k) % len(cand)]
        if a not in chosen: chosen.append(a)
    auth[p[0]] = chosen
# author 1 and 5 active in every year 2021-2024 for relational division
for pid in (12,22,24,27): 
    if 1 not in auth[pid]: auth[pid].insert(0,1)
for pid in (14,19,20,25):
    if 5 not in auth[pid]: auth[pid].insert(0,5)

def q(v):
    if v is None: return "NULL"
    if isinstance(v,bool): return "TRUE" if v else "FALSE"
    if isinstance(v,(int,float)): return str(v)
    return "'" + str(v).replace("'","''") + "'"

out = []
w = out.append
w("-- Test seed: a small, hand-shaped corpus with known answers (h-index, lineage depth, topic paths,")
w("-- retraction exposure). Loaded into the test database by `pnpm db:test`. Explicit ids keep tests stable.")
w("-- Generated by scripts/db/gen-test-seed.py.")
w("BEGIN;")
w("INSERT INTO institution (institution_id, openalex_id, ror_id, institution_name, country_code, institution_type, website) OVERRIDING SYSTEM VALUE VALUES")
inst = [(1,"I1","https://ror.org/05a28rw58","ETH Zurich","CH","EDUCATION","https://ethz.ch"),
        (2,"I2",None,"DeepMind","GB","COMPANY","https://deepmind.google"),
        (3,"I3","https://ror.org/04dese585","Indian Institute of Science","IN","EDUCATION","https://iisc.ac.in"),
        (4,"I4","https://ror.org/042nb2s44","Massachusetts Institute of Technology","US","EDUCATION","https://mit.edu"),
        (5,"I5",None,"PES University","IN","EDUCATION","https://pes.edu")]
w(",\n".join("  ("+", ".join(q(x) for x in r)+")" for r in inst)+";")
w("INSERT INTO venue (venue_id, openalex_id, venue_name, venue_type, publisher, issn_l) OVERRIDING SYSTEM VALUE VALUES")
ven = [(1,"S1","Neural Information Processing Systems","CONFERENCE","NeurIPS Foundation",None),
       (2,"S2","Nature Machine Intelligence","JOURNAL","Springer Nature","2522-5839"),
       (3,"S3","arXiv","REPOSITORY","Cornell University",None),
       (4,"S4","International Conference on Learning Representations","CONFERENCE","ICLR",None),
       (5,"S5","Frontiers in Neuroscience","JOURNAL","Frontiers Media","1662-453X")]
w(",\n".join("  ("+", ".join(q(x) for x in r)+")" for r in ven)+";")
w("INSERT INTO author (author_id, openalex_id, orcid, author_name, institution_id) OVERRIDING SYSTEM VALUE VALUES")
w(",\n".join(f"  ({a[0]}, 'A{a[0]}', {q(a[2])}, {q(a[1])}, {q(a[3])})" for a in authors)+";")
w("INSERT INTO topic (topic_id, openalex_id, topic_name, topic_level, parent_topic_id) OVERRIDING SYSTEM VALUE VALUES")
topics = [(1,"Physical Sciences",0,None),(2,"Computer Science",1,1),(3,"Artificial Intelligence",2,2),
          (4,"Spiking Neural Networks",3,3),(5,"Transformers and Language Models",3,3),(6,"Computer Vision",2,2),
          (7,"Object Detection",3,6),(8,"Health Sciences",0,None),(9,"Medicine",1,8),(10,"Health Informatics",2,9),
          (11,"Clinical Prediction Models",3,10)]
w(",\n".join(f"  ({t[0]}, 'T{t[0]}', {q(t[1])}, {t[2]}, {q(t[3])})" for t in topics)+";")
w("INSERT INTO paper (paper_id, openalex_id, doi, arxiv_id, title, abstract, publication_date, venue_id, work_type, open_access, oa_status, cited_by_count, paper_url) OVERRIDING SYSTEM VALUE VALUES")
rows=[]
for p in papers:
    abstract = f"We study {p[1].lower()}. This test abstract mentions spiking neurons, attention, retrieval and clinical data so full-text search has something to rank."
    url = f"https://example.org/papers/{p[0]}"
    rows.append(f"  ({p[0]}, 'W{p[0]}', {q(p[8])}, {q(p[9])}, {q(p[1])}, {q(abstract)}, {q(p[2])}, {q(p[3])}, {q(p[4])}, {q(p[5])}, {q(p[6])}, {p[7]}, {q(url)})")
w(",\n".join(rows)+";")
w("INSERT INTO paper_author (paper_id, author_id, author_order, is_corresponding, affiliation_institution_id) VALUES")
rows=[]
amap={a[0]:a[3] for a in authors}
for pid,al in auth.items():
    for i,a in enumerate(al):
        rows.append(f"  ({pid}, {a}, {i+1}, {q(i==0)}, {q(amap[a])})")
w(",\n".join(rows)+";")
w("INSERT INTO citation (citing_paper_id, cited_paper_id) VALUES")
w(",\n".join(f"  ({a}, {b})" for a,b in citations)+";")
w("INSERT INTO paper_topic (paper_id, topic_id, relevance_score, is_primary) VALUES")
rows=[]
for p in papers:
    if p[10] is None: continue
    rows.append(f"  ({p[0]}, {p[10]}, 0.9{p[0]%10}, TRUE)")
    if p[10]==4 and p[0] in (7,12,18): rows.append(f"  ({p[0]}, 5, 0.6{p[0]%10}, FALSE)")
    if p[10]==11 and p[0] in (23,): rows.append(f"  ({p[0]}, 7, 0.55, FALSE)")
w(",\n".join(rows)+";")
w("INSERT INTO method (method_id, method_name, method_category, description, introduced_year, pwc_slug) OVERRIDING SYSTEM VALUE VALUES")
methods=[(1,"Surrogate Gradient","Training","Smooth stand-in for the spike derivative",2016,"surrogate-gradient"),
         (2,"Self-Attention","Attention","Scaled dot-product attention",2017,"self-attention"),
         (3,"Retrieval-Augmented Generation","Language Models","Generation grounded on retrieved passages",2020,"rag"),
         (4,"Vision Transformer","Vision","Transformer over image patches",2020,"vision-transformer"),
         (5,"LSTM","Recurrent","Long short-term memory",1997,"lstm")]
w(",\n".join("  ("+", ".join(q(x) for x in r)+")" for r in methods)+";")
w("INSERT INTO paper_method (paper_id, method_id, usage_type) VALUES")
pm=[(2,1,"PROPOSED"),(4,1,"USED"),(7,1,"USED"),(12,1,"USED"),(12,2,"USED"),(3,2,"PROPOSED"),(5,2,"USED"),(10,3,"PROPOSED"),(20,3,"EXTENDED"),(25,3,"USED"),(11,4,"PROPOSED"),(16,4,"USED"),(21,4,"USED"),(9,5,"BASELINE"),(13,5,"COMPARED")]
w(",\n".join(f"  ({a}, {b}, '{c}')" for a,b,c in pm)+";")
w("INSERT INTO dataset (dataset_id, dataset_name, modality, domain, dataset_url, pwc_slug) OVERRIDING SYSTEM VALUE VALUES")
ds=[(1,"ImageNet","Images","Computer vision","https://image-net.org","imagenet"),
    (2,"MIMIC-IV","Tabular","Medical","https://physionet.org/content/mimiciv/","mimic-iv"),
    (3,"DVS Gesture","Events","Neuromorphic vision",None,"dvs-gesture"),
    (4,"Natural Questions","Text","Question answering",None,"natural-questions"),
    (5,"eICU","Tabular","Medical",None,"eicu")]
w(",\n".join("  ("+", ".join(q(x) for x in r)+")" for r in ds)+";")
w("INSERT INTO paper_dataset (paper_id, dataset_id, usage_type) VALUES")
pd=[(4,3,"BENCHMARKING"),(7,3,"BENCHMARKING"),(27,3,"TESTING"),(11,1,"TRAINING"),(16,1,"BENCHMARKING"),(9,2,"TRAINING"),(13,2,"BENCHMARKING"),(17,5,"TRAINING"),(10,4,"BENCHMARKING"),(20,4,"TESTING"),(23,2,"TRAINING")]
w(",\n".join(f"  ({a}, {b}, '{c}')" for a,b,c in pd)+";")
w("INSERT INTO resource (paper_id, resource_type, resource_url) VALUES")
w(",\n".join(f"  ({p[0]}, 'PDF', 'https://example.org/pdf/{p[0]}.pdf')" for p in papers if p[5])+",\n  (3, 'CODE', 'https://github.com/example/attention'),\n  (10, 'CODE', 'https://github.com/example/rag');")
w("-- Users: the hash strings are well-formed Argon2id placeholders; tests never log in with them.")
w("INSERT INTO user_account (user_id, name, email, password_hash, role_id) OVERRIDING SYSTEM VALUE VALUES")
h="$argon2id$v=19$m=19456,t=2,p=1$dGVzdHNhbHQ$dGVzdGhhc2g"
w(f"  (1, 'Ada Admin', 'admin@atlas.test', '{h}', (SELECT role_id FROM role WHERE role_code = 'ADMIN')),")
w(f"  (2, 'Cara Curator', 'curator@atlas.test', '{h}', (SELECT role_id FROM role WHERE role_code = 'CURATOR')),")
w(f"  (3, 'Rhea Researcher', 'rhea@atlas.test', '{h}', (SELECT role_id FROM role WHERE role_code = 'RESEARCHER')),")
w(f"  (4, 'Ravi Researcher', 'ravi@atlas.test', '{h}', (SELECT role_id FROM role WHERE role_code = 'RESEARCHER'));")
w("INSERT INTO collection (collection_id, user_id, collection_name, description, is_public) OVERRIDING SYSTEM VALUE VALUES")
w("  (1, 3, 'Spiking reading list', 'Papers for the SNN survey', FALSE),\n  (2, 3, 'Shared transformer picks', NULL, TRUE),\n  (3, 4, 'Clinical ML', NULL, FALSE);")
w("INSERT INTO collection_paper (collection_id, paper_id, reading_status, priority, position, read_at) VALUES")
w("  (1, 4, 'READ', 'HIGH', 0, TIMESTAMPTZ '2026-09-01 10:00+00'),\n  (1, 12, 'READING', 'HIGH', 1, NULL),\n  (1, 24, 'NOT_READ', 'MEDIUM', 2, NULL),\n  (2, 3, 'READ', 'MEDIUM', 0, TIMESTAMPTZ '2026-09-02 10:00+00'),\n  (2, 10, 'NOT_READ', 'LOW', 1, NULL),\n  (3, 9, 'READING', 'HIGH', 0, NULL);")
w("INSERT INTO note (note_id, user_id, paper_id, note_text, is_private) OVERRIDING SYSTEM VALUE VALUES")
w("  (1, 3, 4, 'Energy numbers look strong; check the hardware assumptions.', TRUE),\n  (2, 3, 12, 'Good bridge between SNNs and attention.', FALSE),\n  (3, 4, 9, 'Baseline for my clinical project.', TRUE),\n  (4, 4, 3, 'Read before the transformer seminar.', TRUE);")
w("-- One real-looking retraction: paper 22 is cited by 24, which is cited by 27 (two-hop exposure).")
w("INSERT INTO retraction (paper_id, retraction_date, reason, notice_url, status, source, recorded_by) VALUES")
w("  (22, DATE '2024-01-10', 'Results could not be reproduced; data fabrication', 'https://example.org/notices/22', 'RETRACTED', 'MANUAL', 1);")
for tbl,col in [("institution","institution_id"),("venue","venue_id"),("author","author_id"),("topic","topic_id"),("paper","paper_id"),("method","method_id"),("dataset","dataset_id"),("user_account","user_id"),("collection","collection_id"),("note","note_id")]:
    w(f"SELECT setval(pg_get_serial_sequence('{tbl}', '{col}'), (SELECT max({col}) FROM {tbl}));")
w("COMMIT;")
open("db/seed/test_seed.sql","w").write("\n".join(out)+"\n")
print("authors per paper:", {k:v for k,v in auth.items()})
