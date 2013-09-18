create index idx_ticket_id on variation(ticket_id);
create index idx_variation_id_and_order_id on stock(variation_id, order_id);
create index idx_name on artist(name);
create index idx_id_and_ticket_id on variation(id, ticket_id);

