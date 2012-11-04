package isucon2.dbutil;

import java.sql.Connection;
import java.sql.SQLException;
import java.util.List;

import javax.sql.DataSource;

import org.apache.commons.dbutils.QueryRunner;
import org.apache.commons.dbutils.handlers.BeanHandler;
import org.apache.commons.dbutils.handlers.BeanListHandler;
import org.apache.commons.dbutils.handlers.ScalarHandler;

public class QueryRunnerWrapper {
	DataSource dataSource;

	public DataSource getDataSource() {
		return dataSource;
	}

	public void setDataSource(DataSource dataSource) {
		this.dataSource = dataSource;
	}

	public Connection getConnection() throws SQLException {
		return dataSource.getConnection();
	}

	public Long getLastInsertId(Connection conn) throws SQLException {
		QueryRunner run = new QueryRunner();
		return run.query(conn, "SELECT LAST_INSERT_ID();",
				new ScalarHandler<Long>());
	}

	public <T> List<T> queryForList(String basequery, Class<T> resulthint)
			throws SQLException {
		QueryRunner run = new QueryRunner(dataSource);
		return run.query(basequery, new BeanListHandler<T>(resulthint));
	}

	public <T> List<T> queryForList(String basequery, Class<T> resulthint,
			Object... condition) throws SQLException {
		QueryRunner run = new QueryRunner(dataSource);
		return run.query(basequery, new BeanListHandler<T>(resulthint), condition);
	}

	public <T> T queryForObject(String basequery, Class<T> resulthint)
			throws SQLException {
		QueryRunner run = new QueryRunner(dataSource);
		return (T) run.query(basequery, new BeanHandler<T>(resulthint));
	}

	public <T> T queryForObject(String basequery, Class<T> resulthint,
			Object... condition) throws SQLException {
		QueryRunner run = new QueryRunner(dataSource);
		return (T) run.query(basequery, new BeanHandler<T>(resulthint), condition);
	}

	public <T> T queryForObject(Connection conn, String basequery,
			Class<T> resulthint, Object... condition) throws SQLException {
		QueryRunner run = new QueryRunner();
		return (T) run.query(conn, basequery, new BeanHandler<T>(resulthint),
				condition);
	}

	public Long count(String basequery, Object... condition)
			throws SQLException {
		QueryRunner run = new QueryRunner(dataSource);
		return run.query(basequery, new ScalarHandler<Long>(), condition);
	}

	public int update(Connection conn, String basequery, Object... condition)
			throws SQLException {
		QueryRunner run = new QueryRunner();
		if (condition == null || condition.length == 0) {
			return run.update(conn, basequery);
		} else {
			return run.update(conn, basequery, condition);
		}
	}
}
