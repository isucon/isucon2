package isucon2.controller;

import java.util.List;

import isucon2.dao.ImpliesDao;
import isucon2.dbutil.admin.Initializer;
import isucon2.model.LatestInfo;

import java.io.IOException;
import java.sql.SQLException;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import javax.servlet.http.HttpServletResponseWrapper;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.servlet.ModelAndView;

@Controller
public class AdminController {
	@Autowired
	Initializer initializer;
	@Autowired
	ImpliesDao dao;
	
	@RequestMapping(value = "/admin", method = RequestMethod.GET)
	public ModelAndView index(HttpServletRequest request,
			HttpServletResponse response) throws SQLException {
		List<LatestInfo> infos = dao.getLatestInfo();
		ModelAndView mv = new ModelAndView("/base");
		mv.addObject("infos", infos);
                mv.addObject("ftl", "admin");
		return mv;
	}

	@RequestMapping(value = "/admin", method = RequestMethod.POST)
	public ModelAndView reset(HttpServletRequest request,
			HttpServletResponse response) throws IOException, SQLException {
		String status = initializer.init(); //for debug
		response.sendRedirect("/admin");
		return null;
	}

	@RequestMapping(value = "/admin/orders", method = RequestMethod.GET)
	public void orders(HttpServletResponse response) throws IOException, SQLException {
		String csvContent= dao.getOrdersCsv();

		HttpServletResponseWrapper wrapper = new HttpServletResponseWrapper(response);
		wrapper.setContentType("text/csv");
		wrapper.setHeader("Content-length", "" + csvContent.getBytes().length);
		response.getWriter().print(csvContent);
	}
}
