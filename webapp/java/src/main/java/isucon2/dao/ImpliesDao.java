package isucon2.dao;

import isucon2.dbutil.QueryRunnerWrapper;
import isucon2.model.Artist;
import isucon2.model.LatestInfo;
import isucon2.model.Stock;
import isucon2.model.Ticket;
import isucon2.model.Variation;
import isucon2.model.OrderRequest;

import java.sql.Connection;
import java.sql.SQLException;
import java.util.List;
import java.text.SimpleDateFormat;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

@Component
public class ImpliesDao {
	@Autowired
	QueryRunnerWrapper queryRunner;

	public List<LatestInfo> getLatestInfo() throws SQLException {
		return queryRunner
				.<LatestInfo> queryForList(
						"SELECT stock.seat_id as seatId, variation.name AS variationName, ticket.name AS ticketName, artist.name AS artistName FROM stock JOIN variation ON stock.variation_id = variation.id JOIN ticket ON variation.ticket_id = ticket.id JOIN artist ON ticket.artist_id = artist.id WHERE order_id IS NOT NULL ORDER BY order_id DESC LIMIT 10",
						LatestInfo.class);
	}

	public List<Artist> getArtists() throws SQLException {
		return queryRunner.<Artist> queryForList(
				"SELECT * FROM artist ORDER BY id", Artist.class);
	}

	public Artist getArtist(int id) throws SQLException {
		return queryRunner.<Artist> queryForObject(
				"SELECT id, name FROM artist WHERE id = ? LIMIT 1",
				Artist.class, id);
	}

	public List<Ticket> getTickets(int artistId) throws SQLException {
		return queryRunner.<Ticket> queryForList(
				"SELECT id, name FROM ticket WHERE artist_id = ? ORDER BY id",
				Ticket.class, artistId);
	}

	public Long getTicketCount(int ticketId) throws SQLException {
		return queryRunner
				.count("SELECT COUNT(*) FROM variation INNER JOIN stock ON stock.variation_id = variation.id WHERE variation.ticket_id = ? AND stock.order_id IS NULL",
						ticketId);
	}

	public Ticket getTicket(int ticketId) throws SQLException {
		return queryRunner
				.<Ticket> queryForObject(
						"SELECT t.*, a.name AS artistName FROM ticket t INNER JOIN artist a ON t.artist_id = a.id WHERE t.id = ? LIMIT 1",
						Ticket.class, ticketId);
	}

	public List<Variation> getVariations(int ticketId) throws SQLException {
		return queryRunner
				.<Variation> queryForList(
						"SELECT id, name FROM variation WHERE ticket_id = ? ORDER BY id",
						Variation.class, ticketId);
	}

	public List<Stock> getStocks(int id) throws SQLException {
		return queryRunner
				.<Stock> queryForList(
						"SELECT seat_id as seatId, order_id as orderId FROM stock WHERE variation_id = ?",
						Stock.class, id);
	}

	public Long getStockCount(int id) throws SQLException {
		return queryRunner
				.count("SELECT COUNT(*) FROM stock WHERE variation_id = ? AND order_id IS NULL",
						id);
	}

	public String doPurchaseTicketTransaction(int variationId, String memberId)
			throws SQLException {
		Connection conn = null;

		try {
			conn = queryRunner.getConnection();
			queryRunner.update(conn,
					"INSERT INTO order_request (member_id) VALUES (?)",
					memberId);
			Long orderId = queryRunner.getLastInsertId(conn);
			int row = queryRunner
					.update(conn,
							"UPDATE stock SET order_id = ? WHERE variation_id = ? AND order_id IS NULL ORDER BY RAND() LIMIT 1",
							orderId.intValue(), variationId);
			if (row > 0) {
				conn.commit();
				Stock stock = queryRunner
						.queryForObject(
								conn,
								"SELECT seat_id as seatId FROM stock WHERE order_id = ? LIMIT 1",
								Stock.class, orderId.intValue());
				return stock.getSeatId();
			} else {
				conn.rollback();// 不要宣言？
				return null;
			}

		} finally {
			if (conn != null) {
				conn.close();
			}
		}
	}

    public String getOrdersCsv() throws SQLException {
        List<OrderRequest> orders = queryRunner.<OrderRequest> queryForList("SELECT order_request.id AS id, order_request.member_id AS memberId, stock.seat_id AS seatId, stock.variation_id AS variationId, stock.updated_at AS updatedAt FROM order_request JOIN stock ON order_request.id = stock.order_id ORDER BY order_request.id ASC",
                                                          OrderRequest.class);
        SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss");
        StringBuilder result = new StringBuilder();
        for (OrderRequest order : orders) {
            result.append(order.getId()).append(",");
            result.append(order.getMemberId()).append(",");
            result.append(order.getSeatId()).append(",");
            result.append(order.getVariationId()).append(",");
            result.append(sdf.format(order.getUpdatedAt())).append("\n");
        }
        return result.toString();
    }
}
