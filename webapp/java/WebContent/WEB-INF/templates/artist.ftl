<h2>${artist.name}</h2>
<ul>
<#list tickets as ticket >
<li class="ticket">
<a href="/ticket/${ticket.id}">${ticket.name}</a>残り<span class="count">${ticket.count?c}</span>枚
</li>
</#list>
</ul>
