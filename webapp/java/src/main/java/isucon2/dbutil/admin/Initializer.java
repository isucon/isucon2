package isucon2.dbutil.admin;

import isucon2.dbutil.QueryRunnerWrapper;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.sql.Connection;
import java.sql.SQLException;

public class Initializer {
	QueryRunnerWrapper queryRunner;
	String filename;
	String encoding = "UTF-8";

	public QueryRunnerWrapper getQueryRunner() {
		return queryRunner;
	}

	public void setQueryRunner(QueryRunnerWrapper queryRunner) {
		this.queryRunner = queryRunner;
	}

	public String getFilename() {
		return filename;
	}

	public void setFilename(String filename) {
		this.filename = filename;
	}

	public String getEncoding() {
		return encoding;
	}

	public void setEncoding(String encoding) {
		this.encoding = encoding;
	}

	public String init() throws IOException, SQLException {
		BufferedReader reader = null;
		Connection conn = null;
		StringBuilder builder = new StringBuilder();
		try {
			reader = new BufferedReader(new InputStreamReader(this.getClass()
					.getResourceAsStream(filename), encoding));

			conn = queryRunner.getConnection();
			while (reader.ready()) {
				String line = reader.readLine();
				if (line == null || line.trim().isEmpty()) {
					continue;
				}
				try {
					queryRunner.update(conn, line, new Object[] {});
					builder.append("SUCCESS:(" + line + ")").append("\n");
					conn.commit();
				} catch (SQLException e) {
					builder.append("FAIL:" + e.getMessage() + " (" + line + ")")
							.append("\n");
				}
			}

			return builder.toString();
		} finally {
			if (reader != null) {
				reader.close();
			}
			if (conn != null) {
				conn.close();
			}
		}
	}
}
