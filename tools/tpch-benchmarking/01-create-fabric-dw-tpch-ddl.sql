--2023-09-12T09:54:14.1047142-07:00
CREATE TABLE customer (
    c_custkey bigint NOT NULL, 
    c_name varchar(25) NOT NULL, 
    c_address varchar(40) NOT NULL, 
    c_nationkey int NOT NULL, 
    c_phone char(15) NOT NULL, 
    c_acctbal decimal(15, 2) NOT NULL, 
    c_mktsegment char(10) NOT NULL, 
    c_comment varchar(117) NOT NULL
);

--------------------------------------------------------------------------------
-- Nation Table
--------------------------------------------------------------------------------  
CREATE TABLE nation
  ( n_nationkey     integer NOT NULL, 
    n_name          char(25) NOT NULL,
    n_regionkey     integer NOT NULL,   
    n_comment       varchar(152) NOT NULL
);

--------------------------------------------------------------------------------
-- LineItem Table
--------------------------------------------------------------------------------
CREATE TABLE lineitem
  ( l_orderkey      bigint NOT NULL,     
    l_partkey       bigint NOT NULL,                                           
    l_suppkey       bigint NOT NULL,                                         
    l_linenumber    bigint NOT NULL,      
    l_quantity      decimal(15,2) NOT NULL,
    l_extendedprice decimal(15,2) NOT NULL,
    l_discount      decimal(15,2) NOT NULL,
    l_tax           decimal(15,2) NOT NULL,
    l_returnflag    char(1) NOT NULL,
    l_linestatus    char(1) NOT NULL,
    l_shipdate      date NOT NULL,
    l_commitdate    date NOT NULL,
    l_receiptdate   date NOT NULL,
    l_shipinstruct  char(25) NOT NULL,
    l_shipmode      char(10) NOT NULL,
	l_comment       varchar(44) NOT NULL
);

--------------------------------------------------------------------------------
-- Orders Table
--------------------------------------------------------------------------------
CREATE TABLE orders
  ( o_orderkey         bigint NOT NULL,
    o_custkey          bigint NOT NULL,   
    o_orderstatus      char(1) NOT NULL,
    o_totalprice       decimal(15,2) NOT NULL,
    o_orderdate        date NOT NULL,
    o_orderpriority    char(15) NOT NULL,
    o_clerk            char(15) NOT NULL,
    o_shippriority     integer NOT NULL,
    o_comment          varchar(79) NOT NULL
);


--------------------------------------------------------------------------------
-- Part Table
--------------------------------------------------------------------------------
CREATE TABLE part
  ( p_partkey       bigint NOT NULL,      
    p_name          varchar(55) NOT NULL,
    p_mfgr          char(25) NOT NULL,
    p_brand         char(10) NOT NULL,
    p_type          varchar(25) NOT NULL,
    p_size          integer NOT NULL,
    p_container     char(10) NOT NULL,
    p_retailprice   decimal(15,2) NOT NULL,
    p_comment       varchar(23) NOT NULL
);

--------------------------------------------------------------------------------
-- PartSupp Table
--------------------------------------------------------------------------------
CREATE TABLE partsupp
  ( ps_partkey      bigint NOT NULL, 
    ps_suppkey      bigint NOT NULL, 
    ps_availqty     integer NOT NULL,
    ps_supplycost   decimal(15,2) NOT NULL,
    ps_comment      varchar(199) NOT NULL
);
--------------------------------------------------------------------------------
-- Region Table
--------------------------------------------------------------------------------
CREATE TABLE region
  ( r_regionkey     integer NOT NULL,   
    r_name          char(25) NOT NULL,
    r_comment       varchar(152) NOT NULL
);

--------------------------------------------------------------------------------
-- Supplier Table
--------------------------------------------------------------------------------
CREATE TABLE supplier
  ( s_suppkey       bigint NOT NULL,      
    s_name          char(25) NOT NULL,
    s_address       varchar(40) NOT NULL,
    s_nationkey     integer NOT NULL,    
    s_phone         char(15) NOT NULL,
    s_acctbal       decimal(15,2) NOT NULL,
    s_comment       varchar(101) NOT NULL
);
