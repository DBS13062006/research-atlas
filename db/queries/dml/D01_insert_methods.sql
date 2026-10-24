-- @id        D01
-- @title     Add new methods in one statement
-- @category  dml
-- @concepts  multi-row INSERT, column defaults, RETURNING
-- @role      ra_curator
-- @params    none
INSERT INTO method (method_name, method_category, description, introduced_year)
VALUES ('Liquid State Machine', 'Reservoir computing', 'Fixed random spiking reservoir with a trained readout', 2002),
       ('Echo State Network', 'Reservoir computing', 'Fixed random recurrent reservoir with a linear readout', 2001),
       ('Modern Hopfield Network', 'Associative memory', 'Continuous Hopfield network with exponential storage capacity', 2020)
RETURNING method_id, method_name, introduced_year;
