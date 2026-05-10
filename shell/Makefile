CC  = gcc
CXX = g++
LEX = flex
YACC = bison

CXXFLAGS = -g -Wall
YACCFLAGS = -d -v

OBJS = y.tab.o lex.yy.o command.o main.o

all: myshell

myshell: $(OBJS)
	$(CXX) $(CXXFLAGS) -o myshell $(OBJS)

y.tab.c y.tab.h: shell.y
	$(YACC) $(YACCFLAGS) -o y.tab.c shell.y

y.tab.o: y.tab.c command.h
	$(CXX) $(CXXFLAGS) -c y.tab.c

lex.yy.c: shell.l y.tab.h
	$(LEX) shell.l

lex.yy.o: lex.yy.c y.tab.h
	$(CXX) $(CXXFLAGS) -c lex.yy.c

command.o: command.cc command.h
	$(CXX) $(CXXFLAGS) -c command.cc

main.o: main.cc command.h
	$(CXX) $(CXXFLAGS) -c main.cc

clean:
	rm -f myshell lex.yy.c y.tab.c y.tab.h y.output $(OBJS)

.PHONY: all clean
