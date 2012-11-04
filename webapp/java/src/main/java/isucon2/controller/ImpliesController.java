package isucon2.controller;

import java.sql.SQLException;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import isucon2.dao.ImpliesDao;
import isucon2.model.Artist;
import isucon2.model.LatestInfo;
import isucon2.model.Stock;
import isucon2.model.Ticket;
import isucon2.model.Variation;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.servlet.ModelAndView;

@Controller
public class ImpliesController {
	@Autowired
	ImpliesDao dao;

	@RequestMapping(value = "/list", method = RequestMethod.GET)
	public ModelAndView list(HttpServletRequest request,
			HttpServletResponse response) throws Exception {
		List<Artist> artists = dao.getArtists();
		List<LatestInfo> infos = dao.getLatestInfo();

		ModelAndView mv = new ModelAndView("/base");
		mv.addObject("artists", artists);
		mv.addObject("infos", infos);
		mv.addObject("ftl", "list");
		return mv;
	}

	@RequestMapping(value = "/artist/{artistId}", method = RequestMethod.GET)
	public ModelAndView artist(@PathVariable int artistId,
			HttpServletRequest request, HttpServletResponse response)
			throws Exception {
		// TODO validation
		Artist artist = dao.getArtist(artistId);
		if (artist == null) {
			; // TODO
		}

		List<Ticket> tickets = dao.getTickets(artistId);
		for (Ticket ticket : tickets) {
			Long count = dao.getTicketCount(ticket.getId());
			ticket.setCount(count == null ? 0 : count.intValue());
		}

		List<LatestInfo> infos = dao.getLatestInfo();

		ModelAndView mv = new ModelAndView("/base");
		mv.addObject("artist", artist);
		mv.addObject("tickets", tickets);
		mv.addObject("infos", infos);
		mv.addObject("ftl", "artist");
		return mv;
	}

	@RequestMapping(value = "/ticket/{ticketId}", method = RequestMethod.GET)
	public ModelAndView ticket(@PathVariable int ticketId,
			HttpServletRequest request, HttpServletResponse response)
			throws Exception {
		// TODO validation
		Ticket ticket = dao.getTicket(ticketId);
		if (ticket == null) {
			; // TODO
		}
		List<Variation> variations = dao.getVariations(ticketId);
		for (Variation variation : variations) {
			Map<String, Boolean> stocks = new HashMap<String, Boolean>();
			for (Stock s : dao.getStocks(variation.getId())) {
				stocks.put(s.getSeatId(), s.getOrderId() > 0);
			}
			variation.setStocks(stocks);
			variation.setVacancy(dao.getStockCount(variation.getId()));
		}
		List<LatestInfo> infos = dao.getLatestInfo();

		ModelAndView mv = new ModelAndView("/base");
		mv.addObject("ticket", ticket);
		mv.addObject("variations", variations);
		mv.addObject("infos", infos);
		mv.addObject("ftl", "ticket");
		return mv;
	}

	@RequestMapping(value = "/buy", method = RequestMethod.POST)
	public ModelAndView buy(
			@RequestParam(value = "variation_id", required = true) int variationId,
			@RequestParam(value = "member_id", required = true) String memberId,
			HttpServletRequest request, HttpServletResponse response)
			throws SQLException {
		// TODO validation
		String seatId = dao.doPurchaseTicketTransaction(variationId, memberId);
		List<LatestInfo> infos = dao.getLatestInfo();

		if (seatId != null) {
			ModelAndView mv = new ModelAndView("/base");
			mv.addObject("variationId", variationId);
			mv.addObject("memberId", memberId);
			mv.addObject("seatId", seatId);
			mv.addObject("infos", infos);
			mv.addObject("ftl", "confirm");
			return mv;

		} else {
			ModelAndView mv = new ModelAndView("/base");
			mv.addObject("infos", infos);
			mv.addObject("ftl", "soldout");
			return mv;
		}
	}

}
