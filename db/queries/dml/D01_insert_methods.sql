-- @id        D01
-- @title     Add new methods in one statement
-- @category  dml
-- @concepts  multi-row INSERT, column defaults, RETURNING
-- @role      ra_curator
-- @params    none
INSERT INTO method (method_name, method_category, description, introduced_year)
VALUES ('Spike-Timing-Dependent Plasticity', 'Learning rule', 'Local Hebbian rule driven by spike timing', 1998),
       ('Low-Rank Adaptation', 'Fine-tuning', 'Trains low-rank update matrices instead of full weights', 2021),
       ('Graph Isomorphism Network', 'Graph neural network', 'Message passing as powerful as the WL test', 2019)
RETURNING method_id, method_name, introduced_year;
